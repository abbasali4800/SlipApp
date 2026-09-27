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

// Helper: Parse 'YYYY-MM-DD' into local Date object (midnight local time)
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Helper: Format Date object to 'YYYY-MM-DD' in local time
function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 9. Users: Get All Users
export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, issuperadmin, is_active')
    .order('id', { ascending: true });

  if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Failed to fetch users');
  return (data || []).map((u) => ({
    id: u.id,
    name: String(u.name || ''),
    username: String(u.username || ''),
    issuperadmin: Boolean(u.issuperadmin),
    isActive: Boolean(u.is_active),
  }));
}

// 10. Users: Create User
export async function createUser(userData) {
  const name = String(userData.name || '').trim();
  const username = String(userData.username || '').trim().toLowerCase();
  const password = String(userData.password || '');

  if (!name || !username || !password) {
    throw new Error('Name, username, and password are required.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({
      name,
      username,
      password_hash: passwordHash,
      issuperadmin: Boolean(userData.issuperadmin),
      is_active: Boolean(userData.isActive ?? true),
    })
    .select('id, name, username, issuperadmin, is_active')
    .single();

  if (error) {
    const msg = error.message || String(error);
    if (msg.includes('duplicate key') || msg.includes('users_username_key')) {
      throw new Error(`Username "${username}" already exists.`);
    }
    throw new Error(msg);
  }

  if (!data) throw new Error('No data returned when creating user.');

  return {
    id: data.id,
    name: String(data.name || ''),
    username: String(data.username || ''),
    issuperadmin: Boolean(data.issuperadmin),
    isActive: Boolean(data.is_active),
  };
}

// 11. Users: Update User
export async function updateUser(userId, userData) {
  const payload = {};
  if (userData.name !== undefined) payload.name = String(userData.name).trim();
  if (userData.username !== undefined) payload.username = String(userData.username).trim().toLowerCase();
  if (userData.issuperadmin !== undefined) payload.issuperadmin = Boolean(userData.issuperadmin);
  if (userData.isActive !== undefined) payload.is_active = Boolean(userData.isActive);
  if (userData.password) {
    payload.password_hash = await bcrypt.hash(String(userData.password), 10);
  }

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select('id, name, username, issuperadmin, is_active')
    .single();

  if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Failed to update user');
  if (!data) throw new Error('No data returned when updating user.');

  return {
    id: data.id,
    name: String(data.name || ''),
    username: String(data.username || ''),
    issuperadmin: Boolean(data.issuperadmin),
    isActive: Boolean(data.is_active),
  };
}

// 12. Users: Delete User
export async function deleteUser(userId) {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Failed to delete user');
  return true;
}

// 13. Analytics & Dashboard Metrics
export async function getAnalytics(targetDateStr) {
  const targetDateObj = parseLocalDate(targetDateStr);

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

  // Calculate Monday of current week
  const dayOfWeek = targetDateObj.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = (dayOfWeek + 6) % 7; // 0 for Mon, 6 for Sun
  const mondayDateObj = new Date(targetDateObj);
  mondayDateObj.setDate(mondayDateObj.getDate() - diffToMonday);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const weeklyRaw = dayLabels.map((label, index) => {
    const d = new Date(mondayDateObj);
    d.setDate(d.getDate() + index);
    const dStr = formatLocalDate(d);
    return { label, date: dStr, count: countCompletedOnDate(dStr) };
  });

  const maxWeeklyCount = Math.max(...weeklyRaw.map((w) => w.count), 1);
  const weeklyGraph = weeklyRaw.map((w) => ({
    label: w.label,
    date: w.date,
    val: w.count,
    height: w.count > 0 ? Math.min(90, Math.max(15, Math.round((w.count / maxWeeklyCount) * 85))) : 0,
  }));

  const getWeekOfMonthLabel = (dayNum) => {
    if (dayNum <= 7) return 'W1 (1-7)';
    if (dayNum <= 14) return 'W2 (8-14)';
    if (dayNum <= 21) return 'W3 (15-21)';
    return 'W4 (22+)';
  };

  const currentYear = targetDateObj.getFullYear();
  const currentMonth = targetDateObj.getMonth();

  const monthBills = billsAll.filter((b) => {
    if (!b.bill_date) return false;
    const bd = parseLocalDate(b.bill_date);
    return bd.getFullYear() === currentYear && bd.getMonth() === currentMonth && (b.status === 'paid' || b.status === 'parcel_paid');
  });

  const monthBuckets = { 'W1 (1-7)': 0, 'W2 (8-14)': 0, 'W3 (15-21)': 0, 'W4 (22+)': 0 };
  monthBills.forEach((b) => {
    const bd = parseLocalDate(b.bill_date);
    const label = getWeekOfMonthLabel(bd.getDate());
    monthBuckets[label] = (monthBuckets[label] || 0) + 1;
  });

  const maxMonthlyCount = Math.max(...Object.values(monthBuckets), 1);
  const monthlyGraph = Object.entries(monthBuckets).map(([label, count]) => ({
    label,
    val: count,
    height: count > 0 ? Math.min(90, Math.max(15, Math.round((count / maxMonthlyCount) * 85))) : 0,
  }));

  const yearlyBills = billsAll.filter((b) => {
    if (!b.bill_date) return false;
    const bd = parseLocalDate(b.bill_date);
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
    const bd = parseLocalDate(b.bill_date);
    const label = getQuarterLabel(bd.getMonth());
    quarterBuckets[label] = (quarterBuckets[label] || 0) + 1;
  });

  const maxYearlyCount = Math.max(...Object.values(quarterBuckets), 1);
  const yearlyGraph = Object.entries(quarterBuckets).map(([label, count]) => ({
    label,
    val: count,
    height: count > 0 ? Math.min(90, Math.max(15, Math.round((count / maxYearlyCount) * 85))) : 0,
  }));

  const yesterdayObj = new Date(targetDateObj);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayCount = countCompletedOnDate(formatLocalDate(yesterdayObj));

  const mondayCount = countCompletedOnDate(formatLocalDate(mondayDateObj));
  const todayCount = completedCount;

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

