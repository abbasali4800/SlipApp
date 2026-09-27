import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wrrvurciwugnkuajdewr.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndycnZ1cmNpd3Vnbmt1YWpkZXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0ODc1MzQsImV4cCI6MjEwNjA2MzUzNH0.AwrudQi3Pn2GaKZA9Pf4nwem8RVp86DYI6qmLjsBSco';

const ExpoSecureStoreAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const MAX_BILL_NUMBER = 250;

// Helper: Format DB row to App bill object
function toBillResponse(row) {
  return {
    id: row.id,
    billNumber: row.bill_number,
    billDate: row.bill_date,
    status: row.status,
    amount: row.amount ? String(row.amount) : null,
    parcelType: row.parcel_type || null,
    createdBy: row.created_by || null,
    paidAt: row.paid_at || null,
    parcelSentAt: row.parcel_sent_at || null,
    parcelPaidAt: row.parcel_paid_at || null,
    editorName: row.users?.name || null,
  };
}

// 1. Auth: Login User
export async function loginUser(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  console.log(`[Supabase Auth] Attempting login for username: "${cleanUsername}"`);
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', cleanUsername)
    .single();

  if (error) {
    console.warn(`[Supabase Auth Error] Query failed for "${cleanUsername}":`, error.message, error.details);
    throw new Error(`Incorrect username or password. (${error.message})`);
  }

  if (!user) {
    console.warn(`[Supabase Auth Error] User "${cleanUsername}" not found in DB.`);
    throw new Error('Incorrect username or password. (User not found)');
  }

  if (!user.is_active) {
    console.warn(`[Supabase Auth Error] User "${cleanUsername}" is inactive.`);
    throw new Error('Account is inactive.');
  }

  console.log(`[Supabase Auth Found User] ID: ${user.id}, Hash in DB: ${user.password_hash?.slice(0, 15)}...`);
  
  const isValid = await bcrypt.compare(password, user.password_hash);
  console.log(`[Supabase Auth Password Compare] Result for "${cleanUsername}": ${isValid ? 'MATCH ✅' : 'MISMATCH ❌'}`);

  if (!isValid) {
    throw new Error('Incorrect username or password. (Password mismatch)');
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    issuperadmin: Boolean(user.issuperadmin),
    isActive: Boolean(user.is_active),
  };
}

// 2. Bills: Get 250 bills for a date
export async function getBillsForDate(billDate) {
  const { data: savedBills, error } = await supabase
    .from('bills')
    .select('*, users(name)')
    .eq('bill_date', billDate)
    .order('bill_number', { ascending: true });

  if (error) throw new Error(error.message);

  const byNumber = new Map(savedBills.map((b) => [b.bill_number, toBillResponse(b)]));

  return Array.from({ length: MAX_BILL_NUMBER }, (_, index) => {
    const billNumber = index + 1;
    return byNumber.get(billNumber) || {
      billNumber,
      billDate,
      status: 'open',
      amount: null,
      parcelType: null,
      createdBy: null,
      paidAt: null,
      parcelSentAt: null,
      parcelPaidAt: null,
    };
  });
}

// 3. Bills: Mark Paid
export async function markBillPaid(billDate, billNumber, userId) {
  const { data, error } = await supabase
    .from('bills')
    .upsert({
      bill_date: billDate,
      bill_number: billNumber,
      status: 'paid',
      amount: null,
      parcel_type: null,
      created_by: userId,
      paid_at: new Date().toISOString(),
      parcel_sent_at: null,
      parcel_paid_at: null,
    }, { onConflict: 'bill_date,bill_number' })
    .select('*, users(name)')
    .single();

  if (error) throw new Error(error.message);
  return toBillResponse(data);
}

// 4. Bills: Mark Parcel
export async function markBillParcel(billDate, billNumber, amount, parcelType, userId) {
  const { data, error } = await supabase
    .from('bills')
    .upsert({
      bill_date: billDate,
      bill_number: billNumber,
      status: 'parcel_pending',
      amount: Number(amount).toFixed(2),
      parcel_type: parcelType === 'sheru' ? 'sheru' : 'regular',
      created_by: userId,
      parcel_sent_at: new Date().toISOString(),
      paid_at: null,
      parcel_paid_at: null,
    }, { onConflict: 'bill_date,bill_number' })
    .select('*, users(name)')
    .single();

  if (error) throw new Error(error.message);
  return toBillResponse(data);
}

// 5. Bills: Mark Parcel Paid
export async function markBillParcelPaid(billDate, billNumber, userId) {
  const { data, error } = await supabase
    .from('bills')
    .upsert({
      bill_date: billDate,
      bill_number: billNumber,
      status: 'parcel_paid',
      created_by: userId,
      parcel_paid_at: new Date().toISOString(),
    }, { onConflict: 'bill_date,bill_number' })
    .select('*, users(name)')
    .single();

  if (error) throw new Error(error.message);
  return toBillResponse(data);
}

// 6. Bills: Reset Bill
export async function resetBill(billDate, billNumber, userId) {
  const { data, error } = await supabase
    .from('bills')
    .upsert({
      bill_date: billDate,
      bill_number: billNumber,
      status: 'open',
      amount: null,
      parcel_type: null,
      created_by: userId,
      paid_at: null,
      parcel_sent_at: null,
      parcel_paid_at: null,
    }, { onConflict: 'bill_date,bill_number' })
    .select('*, users(name)')
    .single();

  if (error) throw new Error(error.message);
  return toBillResponse(data);
}

// 7. Notes: Get Daily Note
export async function getDailyNote(noteDate, userId) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('note_date', noteDate)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? { content: data.content } : { content: '' };
}

// 8. Notes: Save Daily Note
export async function saveDailyNote(noteDate, userId, content) {
  const { data, error } = await supabase
    .from('notes')
    .upsert({
      user_id: userId,
      note_date: noteDate,
      content,
    }, { onConflict: 'user_id,note_date' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 9. Users: Get All Users
export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, issuperadmin, is_active')
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    issuperadmin: Boolean(u.issuperadmin),
    isActive: Boolean(u.is_active),
  }));
}

// 10. Users: Create User
export async function createUser(userData) {
  const passwordHash = await bcrypt.hash(userData.password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({
      name: userData.name.trim(),
      username: userData.username.trim().toLowerCase(),
      password_hash: passwordHash,
      issuperadmin: Boolean(userData.issuperadmin),
      is_active: Boolean(userData.isActive ?? true),
    })
    .select('id, name, username, issuperadmin, is_active')
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    name: data.name,
    username: data.username,
    issuperadmin: Boolean(data.issuperadmin),
    isActive: Boolean(data.is_active),
  };
}

// 11. Users: Update User
export async function updateUser(userId, userData) {
  const payload = {
    name: userData.name?.trim(),
    username: userData.username?.trim().toLowerCase(),
    issuperadmin: userData.issuperadmin !== undefined ? Boolean(userData.issuperadmin) : undefined,
    is_active: userData.isActive !== undefined ? Boolean(userData.isActive) : undefined,
  };
  if (userData.password) {
    payload.password_hash = await bcrypt.hash(userData.password, 10);
  }

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select('id, name, username, issuperadmin, is_active')
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    name: data.name,
    username: data.username,
    issuperadmin: Boolean(data.issuperadmin),
    isActive: Boolean(data.is_active),
  };
}

// 12. Users: Delete User
export async function deleteUser(userId) {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error(error.message);
  return true;
}

// 13. Analytics & Dashboard Metrics
export async function getAnalytics(targetDateStr) {
  const targetDate = new Date(targetDateStr);

  const { data: dayBills } = await supabase.from('bills').select('*, users(name, username)').eq('bill_date', targetDateStr);
  const { data: allBills } = await supabase.from('bills').select('*');

  const billsForDay = dayBills || [];
  const billsAll = allBills || [];

  const completedCount = billsForDay.filter((b) => b.status === 'paid' || b.status === 'parcel_paid').length;
  const uniqueEditors = Array.from(new Set(billsForDay.map((b) => b.created_by).filter(Boolean)));
  
  const parcelBills = billsForDay.filter((b) => b.status === 'parcel_pending' || b.status === 'parcel_paid');
  const commParcelBills = parcelBills.filter((b) => b.parcel_type === 'sheru');
  const normalParcelCount = parcelBills.length - commParcelBills.length;
  const commTotal = commParcelBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const commCommission = commTotal * 0.08;

  const countCompletedOnDate = (dStr) =>
    billsAll.filter((b) => b.bill_date === dStr && (b.status === 'paid' || b.status === 'parcel_paid')).length;

  const getOffsetDateStr = (days) => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const getDayLabel = (dStr) => {
    const d = new Date(dStr);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  };

  const weeklyGraph = Array.from({ length: 7 }, (_, i) => {
    const offset = i - 6;
    const dateStr = getOffsetDateStr(offset);
    return { label: getDayLabel(dateStr), date: dateStr, count: countCompletedOnDate(dateStr) };
  });

  const getDayOfMonth = (dStr) => new Date(dStr).getDate();
  const getWeekOfMonthLabel = (dayNum) => {
    if (dayNum <= 7) return 'W1 (1-7)';
    if (dayNum <= 14) return 'W2 (8-14)';
    if (dayNum <= 21) return 'W3 (15-21)';
    return 'W4 (22+)';
  };

  const currentYear = targetDate.getFullYear();
  const currentMonth = targetDate.getMonth();
  const monthBills = billsAll.filter((b) => {
    if (!b.bill_date) return false;
    const bd = new Date(b.bill_date);
    return bd.getFullYear() === currentYear && bd.getMonth() === currentMonth && (b.status === 'paid' || b.status === 'parcel_paid');
  });

  const monthBuckets = { 'W1 (1-7)': 0, 'W2 (8-14)': 0, 'W3 (15-21)': 0, 'W4 (22+)': 0 };
  monthBills.forEach((b) => {
    const label = getWeekOfMonthLabel(getDayOfMonth(b.bill_date));
    monthBuckets[label] = (monthBuckets[label] || 0) + 1;
  });
  const monthlyGraph = Object.entries(monthBuckets).map(([label, count]) => ({ label, count }));

  const yearlyBills = billsAll.filter((b) => {
    if (!b.bill_date) return false;
    const bd = new Date(b.bill_date);
    return bd.getFullYear() === currentYear && (b.status === 'paid' || b.status === 'parcel_paid');
  });

  const getQuarterLabel = (mIndex) => {
    if (mIndex <= 2) return 'Q1 (Jan-Mar)';
    if (mIndex <= 5) return 'Q2 (Apr-Jun)';
    if (mIndex <= 8) return 'Q3 (Jul-Sep)';
    return 'Q4 (Oct-Dec)';
  };

  const quarterBuckets = { 'Q1 (Jan-Mar)': 0, 'Q2 (Apr-Jun)': 0, 'Q3 (Jul-Sep)': 0, 'Q4 (Oct-Dec)': 0 };
  yearlyBills.forEach((b) => {
    const label = getQuarterLabel(new Date(b.bill_date).getMonth());
    quarterBuckets[label] = (quarterBuckets[label] || 0) + 1;
  });
  const yearlyGraph = Object.entries(quarterBuckets).map(([label, count]) => ({ label, count }));

  const todayCount = completedCount;
  const yesterdayCount = countCompletedOnDate(getOffsetDateStr(-1));
  const mondayCount = countCompletedOnDate(getOffsetDateStr(-((targetDate.getDay() + 6) % 7)));

  return {
    kpis: {
      slipsCompleted: completedCount,
      totalSlips: MAX_BILL_NUMBER,
      usersEditedCount: uniqueEditors.length,
      totalParcelCount: parcelBills.length,
      commParcelCount: commParcelBills.length,
      normalParcelCount,
      commTotal,
      commCommission,
      activeEditors: [],
    },
    graphs: {
      weekly: weeklyGraph,
      monthly: monthlyGraph,
      yearly: yearlyGraph,
    },
    comparisons: [
      { key: 'monday', title: "This Week's Monday", labelA: 'Today', valA: todayCount, labelB: 'Monday', valB: mondayCount },
      { key: 'week', title: 'Yesterday', labelA: 'Today', valA: todayCount, labelB: 'Yesterday', valB: yesterdayCount },
    ],
  };
}
