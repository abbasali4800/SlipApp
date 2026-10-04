import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { COLOR_THEMES, applyTheme, rgba, theme } from './theme';
import {
  loginUser,
  getBillsForDate,
  markBillPaid,
  markBillParcel,
  markBillParcelPaid,
  resetBill,
  getDailyNote,
  saveDailyNote as saveNoteSupabase,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getAnalytics,
} from './supabase';

const REMEMBERED_LOGIN_KEY = 'slip_app_remembered_login';
const SELECTED_THEME_KEY = 'slip_app_selected_theme';
const CARD_SIZE_KEY = 'slip_app_card_size';
const PAID_COLOR_KEY = 'slip_app_paid_color';
const PARCEL_COLOR_KEY = 'slip_app_parcel_color';

const PAID_COLOR_OPTIONS = [
  { label: 'Green', value: '#DCFCE7' },
  { label: 'Emerald', value: '#A7F3D0' },
  { label: 'Mint', value: '#BAF6E6' },
  { label: 'Teal', value: '#99F6E4' },
  { label: 'Lime', value: '#D9F99D' },
];

const PARCEL_COLOR_OPTIONS = [
  { label: 'Mustard', value: '#FEF08A' },
  { label: 'Amber', value: '#FDE68A' },
  { label: 'Orange', value: '#FFEDD5' },
  { label: 'Peach', value: '#FED7AA' },
  { label: 'Violet', value: '#DDD6FE' },
];

const BILL_RANGES = [
  { label: '1-50', start: 1, end: 50 },
  { label: '51-100', start: 51, end: 100 },
  { label: '101-150', start: 101, end: 150 },
  { label: '151-200', start: 151, end: 200 },
  { label: '201-250', start: 201, end: 250 }];

const today = () => new Date().toISOString().slice(0, 10);
let styles = createAppStyles(theme);

function parseNoteContent(content) {
  if (!content) return { left: '', right: '' };
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return { left: String(parsed.left || ''), right: String(parsed.right || '') };
    }
  } catch (_) { }
  return { left: String(content), right: '' };
}

function stringifyNoteContent(left, right) {
  return JSON.stringify({ left, right });
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body || {};

  // 1. Auth: /auth/login
  if (path === '/auth/login' && method === 'POST') {
    const user = await loginUser(body.username, body.password);
    return { user };
  }

  // 2. Bills: GET /bills?date=YYYY-MM-DD
  if (path.startsWith('/bills?') || path === '/bills') {
    const dateMatch = path.match(/date=([^&]+)/);
    const date = dateMatch ? dateMatch[1] : today();
    return await getBillsForDate(date);
  }

  // 3. Analytics: GET /bills/analytics?date=YYYY-MM-DD
  if (path.startsWith('/bills/analytics')) {
    const dateMatch = path.match(/date=([^&]+)/);
    const date = dateMatch ? dateMatch[1] : today();
    return await getAnalytics(date);
  }

  // 4. Bills: Actions
  if (path === '/bills/paid' && method === 'POST') {
    return await markBillPaid(body.billDate, body.billNumber, body.userId);
  }

  if (path === '/bills/parcel' && method === 'POST') {
    return await markBillParcel(body.billDate, body.billNumber, body.amount, body.parcelType, body.userId);
  }

  if (path === '/bills/parcel-paid' && method === 'POST') {
    return await markBillParcelPaid(body.billDate, body.billNumber, body.userId);
  }

  if (path === '/bills/reset' && method === 'POST') {
    return await resetBill(body.billDate, body.billNumber, body.userId);
  }

  // 5. Notes: GET /notes & POST /notes
  if (path.startsWith('/notes') && method === 'GET') {
    const dateMatch = path.match(/date=([^&]+)/);
    const userMatch = path.match(/userId=([^&]+)/);
    const date = dateMatch ? dateMatch[1] : today();
    const userId = userMatch ? Number(userMatch[1]) : 1;
    return await getDailyNote(date, userId);
  }

  if (path === '/notes' && method === 'POST') {
    return await saveNoteSupabase(body.noteDate, body.userId, body.content);
  }

  // 6. Users CRUD
  if (path === '/users' && method === 'GET') {
    return await getUsers();
  }

  if (path === '/users' && method === 'POST') {
    return await createUser(body);
  }

  if (path.startsWith('/users/') && method === 'PATCH') {
    const id = Number(path.split('/')[2]);
    return await updateUser(id, body);
  }

  if (path.startsWith('/users/') && method === 'DELETE') {
    const id = Number(path.split('/')[2]);
    return await deleteUser(id);
  }

  throw new Error(`Unhandled route: ${method} ${path}`);
}

export default function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('slip');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteLeft, setNoteLeft] = useState('');
  const [noteRight, setNoteRight] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cardSize, setCardSize] = useState('big');
  const [userViewMode, setUserViewMode] = useState('list');
  const [paidColor, setPaidColor] = useState('#DCFCE7');
  const [parcelColor, setParcelColor] = useState('#FEF08A');
  const [selectedThemeId, setSelectedThemeId] = useState(COLOR_THEMES[0].id);
  applyTheme(selectedThemeId);
  styles = createAppStyles(theme);
  const [splashVisible, setSplashVisible] = useState(true);
  const splashFade = useRef(new Animated.Value(1)).current;
  const splashScale = useRef(new Animated.Value(1)).current;
  const splashLogoOpacity = useRef(new Animated.Value(0)).current;
  const splashLogoScale = useRef(new Animated.Value(0.82)).current;
  const splashLogoTranslateY = useRef(new Animated.Value(22)).current;
  const loginCardAnim = useRef(new Animated.Value(0)).current;
  const keyboardLiftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(splashLogoOpacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(splashLogoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(splashLogoTranslateY, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(splashFade, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(splashScale, {
          toValue: 1.15,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSplashVisible(false);
      });
    }, 2400);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) {
      loginCardAnim.setValue(0);
      Animated.timing(loginCardAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true
      }).start();
    }
  }, [loginCardAnim, session]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      Animated.timing(keyboardLiftAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardLiftAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardLiftAnim]);
  useEffect(() => {
    let mounted = true;
    async function loadRememberedLogin() {
      try {
        await SecureStore.deleteItemAsync(SELECTED_THEME_KEY);
        setSelectedThemeId('sage-rosegold');
        applyTheme('sage-rosegold');
        const savedCardSize = await SecureStore.getItemAsync(CARD_SIZE_KEY);
        if (savedCardSize) setCardSize(savedCardSize);
        const savedPaidColor = await SecureStore.getItemAsync(PAID_COLOR_KEY);
        if (savedPaidColor) setPaidColor(savedPaidColor);
        const savedParcelColor = await SecureStore.getItemAsync(PARCEL_COLOR_KEY);
        if (savedParcelColor) setParcelColor(savedParcelColor);
        const saved = await SecureStore.getItemAsync(REMEMBERED_LOGIN_KEY);
        if (!saved || !mounted) return;
        const data = JSON.parse(saved);
        setUsername(data.username || '');
        setPassword(data.password || '');
        setRememberMe(true);
      } catch (_) { }
    }
    loadRememberedLogin();
    return () => { mounted = false; };
  }, []);
  async function login() {
    if (!username.trim() || !password) return Alert.alert('Missing details', 'Please enter username and password.');
    setLoading(true);
    try {
      const cleanUsername = username.trim().toLowerCase();
      const data = await api('/auth/login', { method: 'POST', body: { username: cleanUsername, password } });
      if (rememberMe) {
        await SecureStore.setItemAsync(REMEMBERED_LOGIN_KEY, JSON.stringify({ username: cleanUsername, password }));
      } else {
        await SecureStore.deleteItemAsync(REMEMBERED_LOGIN_KEY);
      }
      setSession(data.user);
      setTab(data.user.issuperadmin ? 'dashboard' : 'slip');
    } catch (error) {
      Alert.alert('Unable to sign in', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function openDailyNote() {
    setNoteOpen(true);
    setNoteLoading(true);
    try {
      const data = await api(`/notes?date=${today()}&userId=${session.id}`);
      const note = parseNoteContent(data.content);
      setNoteLeft(note.left);
      setNoteRight(note.right);
    } catch (error) {
      Alert.alert('Unable to load note', error.message);
    } finally {
      setNoteLoading(false);
    }
  }

  async function saveDailyNote() {
    setNoteSaving(true);
    try {
      await api('/notes', { method: 'POST', body: { userId: session.id, noteDate: today(), content: stringifyNoteContent(noteLeft, noteRight) } });
      setNoteOpen(false);
    } catch (error) {
      Alert.alert('Unable to save note', error.message);
    } finally {
      setNoteSaving(false);
    }
  }

  function logout() {
    setSession(null);
    setPassword('');
    setNoteLeft('');
    setNoteRight('');
    setNoteOpen(false);
    setLogoutConfirmOpen(false);
    setProfileOpen(false);
  }

  if (splashVisible) {
    return (
      <Animated.View style={[styles.splashContainer, { opacity: splashFade, transform: [{ scale: splashScale }] }]}>
        <StatusBar style="light" />
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary, '#1E0A45']}
          style={styles.splashBg}
        >
          <SafeAreaView style={styles.splashSafeArea}>
            <Animated.View style={[styles.splashLogoBox, { opacity: splashLogoOpacity, transform: [{ scale: splashLogoScale }, { translateY: splashLogoTranslateY }] }]}>
              <Text style={styles.splashTitle}>ANAND</Text>
              <Text style={styles.splashSubtitle}>RESTAURANT</Text>
            </Animated.View>

            <Animated.View style={[styles.splashFooterBox, { opacity: splashLogoOpacity }]}>
              <Text style={styles.splashFooterText}>FINE DINING & CASH SYSTEM</Text>
            </Animated.View>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.cleanLoginSafe}>
        <StatusBar style="dark" />
        
        {/* Ambient Mesh Background Glowing Glass Orbs */}
        <View style={styles.ambientMeshContainer} pointerEvents="none">
          <LinearGradient
            colors={['#FAF5FF', '#FFFFFF', '#FFFBEB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.loginOrb1} />
          <View style={styles.loginOrb2} />
          <View style={styles.loginOrb3} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.cleanLoginKeyboard}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.cleanLoginScroll}>

            {/* Top Branding Section (Clean Typography without fork/knife logo) */}
            <Animated.View style={[styles.cleanLoginHeader, { opacity: loginCardAnim, transform: [{ translateY: Animated.add(loginCardAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }), keyboardLiftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] })) }] }]}>
              <Text style={styles.cleanBrandTitle}>ANAND</Text>
              <Text style={styles.cleanBrandSub}>RESTAURANT SLIPS</Text>
              <Text style={styles.cleanTagline}>Sign in to manage cashier slips & analytics</Text>
            </Animated.View>

            {/* Glassmorphic Form Card Container */}
            <Animated.View style={[styles.cleanFormContainer, { opacity: loginCardAnim, transform: [{ translateY: Animated.add(loginCardAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }), keyboardLiftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] })) }] }]}>

              {/* Username Input Field */}
              <View style={styles.cleanInputGroup}>
                <Text style={styles.cleanLabel}>Username</Text>
                <View style={styles.cleanInputWrap}>
                  <Ionicons name="person-outline" size={19} color={theme.colors.secondary} style={styles.cleanInputIcon} />
                  <TextInput
                    placeholder="Enter username"
                    placeholderTextColor="#94A3B8"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    style={styles.cleanTextInput}
                  />
                </View>
              </View>

              {/* Password Input Field */}
              <View style={styles.cleanInputGroup}>
                <Text style={styles.cleanLabel}>Password</Text>
                <View style={styles.cleanInputWrap}>
                  <Ionicons name="lock-closed-outline" size={19} color={theme.colors.secondary} style={styles.cleanInputIcon} />
                  <TextInput
                    placeholder="Enter password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!passwordVisible}
                    value={password}
                    onChangeText={setPassword}
                    style={styles.cleanTextInput}
                  />
                  <Pressable onPress={() => setPasswordVisible((visible) => !visible)} style={styles.cleanEyeBtn}>
                    <Ionicons name={passwordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={theme.colors.secondary} />
                  </Pressable>
                </View>
              </View>

              {/* Remember Me Row */}
              <View style={styles.cleanOptionsRow}>
                <Pressable onPress={() => setRememberMe((value) => !value)} style={styles.cleanRememberRow}>
                  <View style={[styles.cleanRememberBox, rememberMe && styles.cleanRememberBoxOn]}>
                    {rememberMe ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={styles.cleanRememberText}>Remember login</Text>
                </Pressable>
              </View>

              {/* Primary Action Button */}
              <Pressable disabled={loading} onPress={login} style={({ pressed }) => [styles.cleanSubmitBtn, pressed && styles.cleanSubmitBtnPressed, loading && styles.disabled]}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.cleanBtnContent}>
                    <Text style={styles.cleanSubmitText}>SIGN IN TO APP</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>

            </Animated.View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.shell}>
        <View style={styles.topbar}>
          <Pressable onPress={() => setProfileOpen(true)} style={styles.profileHeaderBtn}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>
                {String(session.name || session.username || 'U').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.topText}>
              <Text style={styles.roleLine}>{session.issuperadmin ? 'Superadmin' : 'Admin'}</Text>
              <Text style={styles.userLine} numberOfLines={1}>{session.name}</Text>
            </View>
          </Pressable>

          <Pressable onPress={openDailyNote} style={styles.noteBtn}>
            <Ionicons name="document-text-outline" size={16} color="#B76E79" style={{ marginRight: 5 }} />
            <Text style={styles.noteBtnText}>Note</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          {session.issuperadmin && tab === 'dashboard' ? (
            <SuperAdminDashboard session={session} onNavigate={(target) => setTab(target)} />
          ) : tab === 'users' && session.issuperadmin ? (
            <UsersPage session={session} userViewMode={userViewMode} />
          ) : (
            <SlipPage session={session} cardSize={cardSize} paidColor={paidColor} parcelColor={parcelColor} />
          )}
        </View>

        {session.issuperadmin ? (
          <View style={styles.floatingBottomNav}>
            <Tab active={tab === 'dashboard'} icon="analytics-outline" label="Dashboard" onPress={() => setTab('dashboard')} />
            <Tab active={tab === 'slip'} icon="receipt-outline" label="Slips" onPress={() => setTab('slip')} />
            <Tab active={tab === 'users'} icon="people-outline" label="Users" onPress={() => setTab('users')} />
          </View>
        ) : null}
      </View>
      <Modal animationType="slide" transparent visible={noteOpen} onRequestClose={() => setNoteOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setNoteOpen(false)}><Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
          <View style={styles.drawerHead}><View><Text style={styles.kicker}>Daily Note</Text><Text style={styles.drawerTitle}>Today</Text></View><Pressable onPress={() => setNoteOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}><Ionicons name="close-circle-outline" size={26} color="#6B8E7B" /></Pressable></View>
          <View style={styles.noteCard}>
            <Text style={styles.noteDate}>{today()}</Text>
            <View style={styles.noteInputWrap}>
              <View style={styles.noteDivider} />
              <TextInput editable={!noteLoading && !noteSaving} multiline placeholder="" placeholderTextColor={theme.colors.placeholder} style={[styles.noteInput, styles.noteInputLeft]} value={noteLeft} onChangeText={setNoteLeft} />
              <TextInput editable={!noteLoading && !noteSaving} multiline placeholder="" placeholderTextColor={theme.colors.placeholder} style={[styles.noteInput, styles.noteInputRight]} value={noteRight} onChangeText={setNoteRight} />
            </View>
            <Pressable disabled={noteLoading || noteSaving} onPress={saveDailyNote} style={[styles.noteSaveBtn, (noteLoading || noteSaving) && styles.disabled]}>{noteSaving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.noteSaveText}>Save Note</Text>}</Pressable>
          </View>
        </Pressable></Pressable>
      </Modal>
      <Modal animationType="slide" transparent visible={profileOpen} onRequestClose={() => setProfileOpen(false)}>
        <Pressable style={styles.leftOverlay} onPress={() => setProfileOpen(false)}>
          <Pressable style={styles.leftPanel} onPress={(event) => event.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>

              {/* Header Close */}
              <View style={styles.settingsHeaderRow}>
                <Text style={styles.settingsKicker}>SETTINGS & PROFILE</Text>
                <Pressable onPress={() => setProfileOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}>
                  <Ionicons name="close-circle-outline" size={26} color="#6B8E7B" />
                </Pressable>
              </View>

              {/* Profile Card */}
              <View style={styles.profileHead}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {String(session.name || session.username || 'U').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileTitleWrap}>
                  <Text style={styles.profileName}>{session.name}</Text>
                  <Text style={styles.profileRole}>{session.issuperadmin ? 'Superadmin' : 'Admin'}</Text>
                </View>
              </View>

              {/* Card Grid View Switch Toggle */}
              <View style={styles.gridSwitchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.gridSwitchTitle}>Compact 4-Column Grid</Text>
                  <Text style={styles.gridSwitchSub}>{cardSize === 'small' ? 'Showing 4 slips per row' : 'Showing 3 slips per row (Standard)'}</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    const newSize = cardSize === 'small' ? 'big' : 'small';
                    setCardSize(newSize);
                    await SecureStore.setItemAsync(CARD_SIZE_KEY, newSize);
                  }}
                  style={[styles.switchTrack, cardSize === 'small' && styles.switchTrackOn]}
                >
                  <View style={[styles.switchThumb, cardSize === 'small' && styles.switchThumbOn]}>
                    <Ionicons
                      name={cardSize === 'small' ? 'keypad' : 'grid-outline'}
                      size={12}
                      color={cardSize === 'small' ? theme.colors.accent : '#7A8C82'}
                    />
                  </View>
                </Pressable>
              </View>

              {/* User Page Layout Switch Toggle (Exclusive for Superadmin) */}
              {session.issuperadmin ? (
                <View style={styles.gridSwitchRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.gridSwitchTitle}>User Page Kanban Cards</Text>
                    <Text style={styles.gridSwitchSub}>{userViewMode === 'kanban' ? 'Showing user cards (Grid layout)' : 'Showing user list (Clean layout)'}</Text>
                  </View>
                  <Pressable
                    onPress={() => setUserViewMode((prev) => (prev === 'list' ? 'kanban' : 'list'))}
                    style={[styles.switchTrack, userViewMode === 'kanban' && styles.switchTrackOn]}
                  >
                    <View style={[styles.switchThumb, userViewMode === 'kanban' && styles.switchThumbOn]}>
                      <Ionicons
                        name={userViewMode === 'kanban' ? 'grid' : 'list-outline'}
                        size={12}
                        color={userViewMode === 'kanban' ? theme.colors.accent : '#7A8C82'}
                      />
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {/* Relocated Logout Button */}
              <Pressable
                onPress={() => {
                  setProfileOpen(false);
                  setLogoutConfirmOpen(true);
                }}
                style={styles.settingsLogoutBtn}
              >
                <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
                <Text style={styles.settingsLogoutText}>Logout Account</Text>
              </Pressable>

            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal animationType="fade" transparent visible={logoutConfirmOpen} onRequestClose={() => setLogoutConfirmOpen(false)}>
        <Pressable style={styles.centerOverlay} onPress={() => setLogoutConfirmOpen(false)}><Pressable style={styles.logoutConfirmCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.logoutConfirmIcon}><Text style={styles.logoutConfirmIconText}>X</Text></View>
          <Text style={styles.logoutConfirmTitle}>Logout?</Text>
          <Text style={styles.logoutConfirmText}>Are you sure you want to logout from this account?</Text>
          <View style={styles.logoutConfirmActions}>
            <Pressable onPress={() => setLogoutConfirmOpen(false)} style={styles.cancelLogoutBtn}><Text style={styles.cancelLogoutText}>Cancel</Text></Pressable>
            <Pressable onPress={logout} style={styles.confirmLogoutBtn}><Text style={styles.confirmLogoutText}>Logout</Text></Pressable>
          </View>
        </Pressable></Pressable>
      </Modal>
    </SafeAreaView>);

}

function Field(props) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput placeholderTextColor={theme.colors.placeholder} style={styles.input} {...props} /></View>;
}

function Tab({ active, icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.slimTab, active && styles.slimTabActive]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? '#FFFFFF' : '#4D6E5B'} style={{ marginRight: 5 }} /> : null}
      <Text style={[styles.slimTabText, active && styles.slimTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CustomCalendar({ selectedDate, onSelectDate, activeTab = 'date1', compareDate }) {
  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const parts = selectedDate.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    }
    return new Date();
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, dateStr: formattedDate });
  }

  return (
    <View style={styles.customCalContainer}>
      {/* Month & Year Header Navigation */}
      <View style={styles.customCalHeader}>
        <Pressable onPress={prevMonth} style={styles.customCalNavBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
        </Pressable>
        <Text style={styles.customCalMonthTitle}>{monthNames[month]} {year}</Text>
        <Pressable onPress={nextMonth} style={styles.customCalNavBtn} hitSlop={10}>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      {/* Week Day Labels */}
      <View style={styles.customCalDaysRow}>
        {dayLabels.map((label, idx) => (
          <Text key={idx} style={styles.customCalDayLabel}>{label}</Text>
        ))}
      </View>

      {/* Grid of Days */}
      <View style={styles.customCalGrid}>
        {calendarCells.map((cell, idx) => {
          if (!cell) {
            return <View key={idx} style={styles.customCalCellEmpty} />;
          }

          const isSelected = cell.dateStr === selectedDate;
          const isCompare = cell.dateStr === compareDate;
          const isDate1Active = activeTab === 'date1';

          return (
            <Pressable
              key={idx}
              onPress={() => onSelectDate(cell.dateStr)}
              style={[
                styles.customCalCell,
                isSelected && (isDate1Active ? styles.customCalCellActive1 : styles.customCalCellActive2),
                isCompare && !isSelected && styles.customCalCellCompare,
              ]}
            >
              <Text
                style={[
                  styles.customCalCellText,
                  isSelected && styles.customCalCellTextActive,
                  isCompare && !isSelected && styles.customCalCellTextCompare,
                ]}
              >
                {cell.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SuperAdminDashboard({ session, onNavigate }) {
  const [graphPeriod, setGraphPeriod] = useState('weekly'); // 'weekly' | 'monthly' | 'yearly'
  const [chartType, setChartType] = useState('line'); // 'line' | 'bar'
  const [selectedCompareKey, setSelectedCompareKey] = useState('week'); // 'monday' | 'week' | 'month' | 'month_ly' | 'year_today' | 'custom'
  const [customDate1, setCustomDate1] = useState(today());
  const [customDate2, setCustomDate2] = useState(today());
  const [customVal1, setCustomVal1] = useState(0);
  const [customVal2, setCustomVal2] = useState(0);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [calActiveTab, setCalActiveTab] = useState('date1'); // 'date1' | 'date2'
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorsModalOpen, setEditorsModalOpen] = useState(false);

  async function loadAnalytics() {
    try {
      const data = await api(`/bills/analytics?date=${today()}`);
      setAnalytics(data);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomComparison() {
    try {
      const [data1, data2] = await Promise.all([
        api(`/bills?date=${customDate1}`),
        api(`/bills?date=${customDate2}`),
      ]);
      const count1 = data1.filter((b) => b.status === 'paid' || b.status === 'parcel_paid').length;
      const count2 = data2.filter((b) => b.status === 'paid' || b.status === 'parcel_paid').length;
      setCustomVal1(count1);
      setCustomVal2(count2);
      setShowCustomModal(false);
    } catch (_) {}
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const kpis = analytics?.kpis || {
    slipsCompleted: 0,
    totalSlips: 250,
    usersEditedCount: 0,
    totalParcelCount: 0,
    commParcelCount: 0,
    normalParcelCount: 0,
    commTotal: 0,
    commCommission: 0,
    activeEditors: [],
  };

  const graphData = analytics?.graphs?.[graphPeriod] || [];
  const comparisons = analytics?.comparisons || [];
  const activeComparison = comparisons.find((c) => c.key === selectedCompareKey) || comparisons[0];

  const completionPct = ((kpis.slipsCompleted / kpis.totalSlips) * 100).toFixed(1);

  return (
    <>
      <ScrollView contentContainerStyle={styles.dashContainer} showsVerticalScrollIndicator={false}>

        {/* 4 KPI CARDS GRID */}
        <View style={styles.dashKpiGrid}>
          
          {/* Card A: Slips Completed -> Redirects to Slips */}
          <Pressable onPress={() => onNavigate?.('slip')} style={[styles.dashKpiCard, styles.dashKpiCardPrimary]}>
            <View style={styles.dashKpiTop}>
              <Text style={styles.dashKpiLabel}>Slips Completed</Text>
              <View style={styles.dashKpiIconWrap}>
                <Ionicons name="checkmark-done-circle-outline" size={20} color="#2F4336" />
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color="#2F4336" size="small" style={{ marginVertical: 6 }} />
            ) : (
              <>
                <Text style={styles.dashKpiValue}>{kpis.slipsCompleted} / {kpis.totalSlips}</Text>
                <Text style={styles.dashKpiTrend}>{completionPct}% completed today</Text>
              </>
            )}
          </Pressable>

          {/* Card B: Users Edited Slips -> Shows Active Editors Popup */}
          <Pressable onPress={() => setEditorsModalOpen(true)} style={styles.dashKpiCard}>
            <View style={styles.dashKpiTop}>
              <Text style={styles.dashKpiLabel}>Users Edited</Text>
              <View style={styles.dashKpiIconWrap}>
                <Ionicons name="create-outline" size={18} color="#B76E79" />
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color="#B76E79" size="small" style={{ marginVertical: 6 }} />
            ) : (
              <>
                <Text style={styles.dashKpiValue}>{kpis.usersEditedCount} Cashiers</Text>
                <Text style={styles.dashKpiHint}>Active slip editors today</Text>
              </>
            )}
          </Pressable>

          {/* Card C: Total Parcel Slips -> Redirects to Slips */}
          <Pressable onPress={() => onNavigate?.('slip')} style={styles.dashKpiCard}>
            <View style={styles.dashKpiTop}>
              <Text style={styles.dashKpiLabel}>Total Parcel Slips</Text>
              <View style={styles.dashKpiIconWrap}>
                <Ionicons name="cube-outline" size={18} color="#CA8A04" />
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color="#CA8A04" size="small" style={{ marginVertical: 6 }} />
            ) : (
              <>
                <Text style={styles.dashKpiValue}>{kpis.totalParcelCount} Slips</Text>
                <Text style={styles.dashKpiHint}>{kpis.commParcelCount} Comm + {kpis.normalParcelCount} Normal</Text>
              </>
            )}
          </Pressable>

          {/* Card D: Total Price of Comm Parcel -> Redirects to Slips */}
          <Pressable onPress={() => onNavigate?.('slip')} style={styles.dashKpiCard}>
            <View style={styles.dashKpiTop}>
              <Text style={styles.dashKpiLabel}>Comm Parcel Total</Text>
              <View style={styles.dashKpiIconWrap}>
                <Ionicons name="pie-chart-outline" size={18} color="#2F4336" />
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color="#2F4336" size="small" style={{ marginVertical: 6 }} />
            ) : (
              <>
                <Text style={styles.dashKpiValue}>Rs {Number(kpis.commTotal).toLocaleString()}</Text>
                <View style={styles.dashHighlightBox}>
                  <Text style={styles.dashHighlightLabel}>8% TOTAL COMM:</Text>
                  <Text style={styles.dashHighlightValue}>Rs {Number(kpis.commCommission).toLocaleString()}</Text>
                </View>
              </>
            )}
          </Pressable>

        </View>

      {/* GRAPH SECTION WITH PERIOD & CHART TYPE TOGGLES */}
      <View style={styles.dashChartCard}>
        <View style={styles.dashChartHeaderRow}>
          <Text style={styles.dashChartTitle}>SLIPS COMPLETED GRAPH</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            
            {/* Chart Type Toggle (Line vs Bar) */}
            <View style={styles.periodPillRow}>
              <Pressable
                onPress={() => setChartType('line')}
                style={[styles.periodPill, chartType === 'line' && styles.periodPillActive]}
              >
                <Ionicons name="trending-up-outline" size={13} color={chartType === 'line' ? '#FFFFFF' : '#4D6E5B'} />
              </Pressable>
              <Pressable
                onPress={() => setChartType('bar')}
                style={[styles.periodPill, chartType === 'bar' && styles.periodPillActive]}
              >
                <Ionicons name="stats-chart-outline" size={13} color={chartType === 'bar' ? '#FFFFFF' : '#4D6E5B'} />
              </Pressable>
            </View>

            {/* Timeframe Periods (Weekly, Monthly, Yearly) */}
            <View style={styles.periodPillRow}>
              {[
                { key: 'weekly', label: 'Weekly' },
                { key: 'monthly', label: 'Monthly' },
                { key: 'yearly', label: 'Yearly' },
              ].map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => setGraphPeriod(p.key)}
                  style={[styles.periodPill, graphPeriod === p.key && styles.periodPillActive]}
                >
                  <Text style={[styles.periodPillText, graphPeriod === p.key && styles.periodPillTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

          </View>
        </View>

        {chartType === 'line' ? (
          <View style={styles.lineChartWrap}>
            {/* Line Trend Points */}
            <View style={styles.lineChartCanvas}>
              {graphData.map((pt, idx) => {
                const valNum = Number(pt.val || 0);
                return (
                  <View key={idx} style={styles.lineCol}>
                    <Text style={styles.dashBarVal}>{pt.val}</Text>
                    <View style={styles.lineTrack}>
                      {valNum > 0 ? (
                        <View style={[styles.lineDot, { bottom: `${Math.min(90, Math.max(10, pt.height))}%` }]}>
                          <View style={styles.lineInnerDot} />
                        </View>
                      ) : (
                        <View style={[styles.lineDot, { bottom: '0%', backgroundColor: 'transparent' }]}>
                          <View style={[styles.lineInnerDot, { backgroundColor: 'rgba(47, 67, 54, 0.25)' }]} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.dashBarLabel}>{pt.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.dashBarChart}>
            {graphData.map((bar, idx) => {
              const valNum = Number(bar.val || 0);
              return (
                <View key={idx} style={styles.dashBarCol}>
                  <Text style={styles.dashBarVal}>{bar.val}</Text>
                  <View style={styles.dashBarTrack}>
                    {valNum > 0 ? (
                      <View style={[styles.dashBarFill, { height: `${bar.height}%` }]} />
                    ) : null}
                  </View>
                  <Text style={styles.dashBarLabel}>{bar.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* SLIP COMPLETION CUSTOM COMPARISON SECTION */}
      <View style={{ marginTop: 22, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={styles.dashSectionTitle}>SLIP COMPLETION COMPARISON</Text>
          <Pressable onPress={() => setShowCustomModal(true)} style={styles.customDateSelectBtn}>
            <Ionicons name="calendar-outline" size={15} color={theme.colors.accent} />
            <Text style={styles.customDateSelectText}>Select Dates</Text>
          </Pressable>
        </View>

        {/* CUSTOM COMPARISON DISPLAY CARD */}
        <View style={styles.compareCard}>
          <View style={styles.compareCardTop}>
            <Text style={styles.compareTitle}>Date Range Comparison</Text>
            {customVal1 !== customVal2 ? (
              <View style={[styles.compareBadge, customVal1 >= customVal2 ? styles.compareBadgePos : styles.compareBadgeNeg]}>
                <Ionicons name={customVal1 >= customVal2 ? 'trending-up' : 'trending-down'} size={12} color={customVal1 >= customVal2 ? '#10B981' : '#EF4444'} />
                <Text style={[styles.compareBadgeText, customVal1 >= customVal2 ? styles.compareBadgeTextPos : styles.compareBadgeTextNeg]}>
                  {customVal2 > 0 ? `${(((customVal1 - customVal2) / customVal2) * 100).toFixed(1)}%` : 'New'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.compareDataRow}>
            <View style={styles.compareCol}>
              <Text style={styles.compareColLabel}>DATE 1 ({customDate1})</Text>
              <Text style={styles.compareColVal}>{customVal1} slips</Text>
            </View>
            <View style={styles.compareDivider} />
            <View style={styles.compareCol}>
              <Text style={styles.compareColLabel}>DATE 2 ({customDate2})</Text>
              <Text style={styles.compareColValMuted}>{customVal2} slips</Text>
            </View>
          </View>
        </View>
      </View>

      </ScrollView>

      {/* ACTIVE SLIP EDITORS MODAL */}
      <Modal animationType="slide" transparent visible={editorsModalOpen} onRequestClose={() => setEditorsModalOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setEditorsModalOpen(false)}>
          <Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHead}>
              <View>
                <Text style={styles.kicker}>ACTIVE SLIP EDITORS</Text>
                <Text style={styles.drawerTitle}>Today ({today()})</Text>
              </View>
              <Pressable onPress={() => setEditorsModalOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}>
                <Ionicons name="close-circle-outline" size={26} color="#6B8E7B" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 10, gap: 10 }}>
              {!kpis.activeEditors || kpis.activeEditors.length === 0 ? (
                <Text style={styles.empty}>No users have edited or completed slips today yet.</Text>
              ) : (
                kpis.activeEditors.map((editor) => (
                  <View key={editor.id} style={styles.editorCardRow}>
                    <View style={styles.editorAvatar}>
                      <Text style={styles.editorAvatarText}>
                        {String(editor.name || editor.username || 'U').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editorName}>{editor.name}</Text>
                      <Text style={styles.editorUsername}>@{editor.username} • {editor.role}</Text>
                    </View>
                    <View style={styles.editorBadge}>
                      <Text style={styles.editorBadgeText}>{editor.editedSlipsCount} Slips</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* CUSTOM DATE COMPARISON MODAL */}
      <Modal animationType="slide" transparent visible={showCustomModal} onRequestClose={() => setShowCustomModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCustomModal(false)}>
          <Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHead}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.kicker}>CUSTOM COMPARISON</Text>
                <Text style={styles.drawerTitle} numberOfLines={1}>Select 2 Dates</Text>
              </View>
              <Pressable onPress={() => setShowCustomModal(false)} hitSlop={12} style={styles.cleanCloseIconButton}>
                <Ionicons name="close-circle-outline" size={26} color={theme.colors.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
              {/* Dual Segmented Control Toggle (Date 1 vs Date 2) */}
              <View style={styles.calSegmentContainer}>
                <Pressable
                  onPress={() => setCalActiveTab('date1')}
                  style={[styles.calSegmentBtn, calActiveTab === 'date1' && styles.calSegmentBtnActive1]}
                >
                  <Ionicons name="calendar" size={15} color={calActiveTab === 'date1' ? '#FFFFFF' : theme.colors.accent} />
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={[styles.calSegmentTitle, calActiveTab === 'date1' && styles.calSegmentTextActive]}>DATE 1</Text>
                    <Text style={[styles.calSegmentVal, calActiveTab === 'date1' && styles.calSegmentTextActive]}>{customDate1}</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setCalActiveTab('date2')}
                  style={[styles.calSegmentBtn, calActiveTab === 'date2' && styles.calSegmentBtnActive2]}
                >
                  <Ionicons name="calendar-outline" size={15} color={calActiveTab === 'date2' ? '#FFFFFF' : theme.colors.primary} />
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={[styles.calSegmentTitle, calActiveTab === 'date2' && styles.calSegmentTextActive]}>DATE 2</Text>
                    <Text style={[styles.calSegmentVal, calActiveTab === 'date2' && styles.calSegmentTextActive]}>{customDate2}</Text>
                  </View>
                </Pressable>
              </View>

              {/* Direct Keyboard Input Fallback */}
              <View style={styles.calDirectWrap}>
                <Ionicons name="create-outline" size={16} color={theme.colors.muted} style={{ marginLeft: 10 }} />
                <TextInput
                  placeholder="YYYY-MM-DD (e.g. 2026-09-27)"
                  placeholderTextColor={theme.colors.placeholder}
                  value={calActiveTab === 'date1' ? customDate1 : customDate2}
                  onChangeText={(val) => {
                    if (calActiveTab === 'date1') setCustomDate1(val);
                    else setCustomDate2(val);
                  }}
                  style={styles.calDirectInput}
                />
              </View>

              {/* 100% Theme-Matched Custom Calendar Component */}
              <CustomCalendar
                selectedDate={calActiveTab === 'date1' ? customDate1 : customDate2}
                compareDate={calActiveTab === 'date1' ? customDate2 : customDate1}
                activeTab={calActiveTab}
                onSelectDate={(dateStr) => {
                  if (calActiveTab === 'date1') {
                    setCustomDate1(dateStr);
                    setCalActiveTab('date2'); // Smooth auto-switch to Date 2 selection
                  } else {
                    setCustomDate2(dateStr);
                  }
                }}
              />

              <Pressable onPress={loadCustomComparison} style={[styles.noteSaveBtn, { width: '100%', marginTop: 6 }]}>
                <Text style={styles.noteSaveText}>Compare Slips</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function SlipPage({ session, cardSize, paidColor, parcelColor }) {
  const [billDate, setBillDate] = useState(today());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [parcelAmount, setParcelAmount] = useState('');
  const [screen, setScreen] = useState('bills');
  const [parcelFilter, setParcelFilter] = useState('pending');
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(150);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [parcelModalOpen, setParcelModalOpen] = useState(false);
  const [parcelPayOpen, setParcelPayOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const parcels = useMemo(() => bills.filter((bill) => bill.status === 'parcel_pending' || bill.status === 'parcel_paid'), [bills]);
  const visibleParcels = useMemo(() => parcels.filter((bill) => parcelFilter === 'paid' ? bill.status === 'parcel_paid' : bill.status === 'parcel_pending'), [parcels, parcelFilter]);
  const visibleBills = useMemo(() => bills.slice(0, Math.min(displayLimit, 250)), [bills, displayLimit]);
  const totals = useMemo(() => {
    const sheruAmount = parcels.filter((bill) => bill.parcelType === 'sheru').reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
    return {
      paid: bills.filter((bill) => bill.status === 'paid' || bill.status === 'parcel_paid').length,
      pending: bills.filter((bill) => bill.status === 'parcel_pending').length,
      sheruAmount,
      sheruCommission: sheruAmount * 0.08
    };
  }, [bills, parcels]);

  function handleScroll(event) {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 15;
    const isEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    setIsAtBottom(isEnd);
  }

  async function loadBills() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) {
      setMessage('Date must be YYYY-MM-DD.');
      return;
    }
    setLoading(true);
    setMessage('');
    setDisplayLimit(150);
    setIsAtBottom(false);
    try {
      const data = await api(`/bills?date=${billDate}`);
      setBills(data);
      setSelectedBill((old) => old ? data.find((bill) => bill.billNumber === old.billNumber) || null : null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBills(); }, [billDate]);

  function openBill(bill, forceAudit = false) {
    setSelectedBill(bill);
    setParcelAmount(bill.amount ? String(bill.amount) : '');
    setDrawerOpen(false);
    setParcelPayOpen(false);
    setDetailsOpen(false);

    if (forceAudit) {
      setDetailsOpen(true);
      return;
    }

    if (bill.status === 'parcel_pending') {
      setParcelPayOpen(true);
      return;
    }

    if (bill.status === 'paid' || bill.status === 'parcel_paid') {
      setDetailsOpen(true);
      return;
    }

    setDrawerOpen(true);
  }

  async function updateBill(path, payload, closeDrawer = false) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const updated = await api(path, { method: 'POST', body: { billDate, userId: session.id, ...payload } });
      setBills((current) => current.map((bill) => bill.billNumber === updated.billNumber ? updated : bill));
      setSelectedBill(updated);
      setParcelAmount('');
      if (closeDrawer) {
        setDrawerOpen(false);
        setParcelPayOpen(false);
        setDetailsOpen(false);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>

      {screen === 'bills' ?
        <View style={styles.slipScreen}>

          {/* Summary Dashboard Toggle Bar */}
          <View style={styles.summaryToggleBar}>
            <Pressable onPress={() => setSummaryCollapsed((prev) => !prev)} style={styles.summaryToggleBtn}>
              <Ionicons name={summaryCollapsed ? 'stats-chart-outline' : 'chevron-up-circle'} size={17} color="#2F4336" />
              <Text style={styles.summaryToggleText}>
                {summaryCollapsed ? 'Show Dashboard Metrics' : 'Hide Dashboard Metrics'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.compactDateBtn}>
              <Ionicons name="calendar-outline" size={14} color="#B76E79" style={{ marginRight: 5 }} />
              <Text style={styles.compactDateText}>{billDate}</Text>
            </Pressable>
          </View>

          {!summaryCollapsed ? (
            <View style={styles.filterPanel}>
              <View style={styles.filterRow}>
                <Metric value={totals.paid} label="paid" />
                <Pressable onPress={() => { setParcelFilter('pending'); setParcelModalOpen(true); }} style={styles.parcelPendingMetric}>
                  <Text style={styles.parcelPendingValue}>{totals.pending}</Text>
                  <Text style={styles.parcelPendingLabel}>parcel pending</Text>
                </Pressable>
              </View>
              <View style={styles.filterRow}>
                <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateFilter}>
                  <Text style={styles.metricLabel}>date</Text>
                  <Text style={styles.dateValue}>{billDate}</Text>
                </Pressable>
                <View style={styles.comFilter}>
                  <View style={styles.comSide}>
                    <Text style={styles.metricValue}>Rs {totals.sheruAmount.toFixed(0)}</Text>
                    <Text style={styles.metricLabel}>com total</Text>
                  </View>
                  <View style={styles.comDivider} />
                  <View style={[styles.comSide, styles.comSideRight]}>
                    <Text style={styles.metricValue}>Rs {totals.sheruCommission.toFixed(2)}</Text>
                    <Text style={styles.metricLabel}>8% commission</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {showDatePicker ?
            <DateTimePicker
              display="calendar"
              maximumDate={new Date()}
              mode="date"
              onDismiss={() => setShowDatePicker(false)}
              onValueChange={(selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  setBillDate(selectedDate.toISOString().slice(0, 10));
                }
              }}
              value={new Date(billDate)} /> :

            null}
          {message ? <Text style={styles.status}>{message}</Text> : null}
          <View style={{ flex: 1 }}>
            <ScrollView
              style={styles.gridScroller}
              contentContainerStyle={[styles.gridScrollContent, { paddingBottom: 24 }]}
              showsVerticalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
            >
              <View style={styles.grid}>
                {visibleBills.map((bill) => (
                  <BillCell
                    key={bill.billNumber}
                    bill={bill}
                    selected={selectedBill?.billNumber === bill.billNumber}
                    onPress={() => openBill(bill)}
                    cardSize={cardSize}
                    paidColor={paidColor}
                    parcelColor={parcelColor}
                  />
                ))}
              </View>

              {/* Clean Inline Load Button right after Slip 150 (Capped at 250 Max) */}
              {displayLimit < Math.min(bills.length, 250) ? (
                <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => setDisplayLimit(250)}
                    style={({ pressed }) => [styles.floatingLoadBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                  >
                    <Ionicons name="arrow-down-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.floatingLoadText}>Load Next 100 Slips (150 of 250)</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View> :
        <ParcelList busy={busy} parcelFilter={parcelFilter} setParcelFilter={setParcelFilter} visibleParcels={visibleParcels} updateBill={updateBill} />}


      <Modal animationType="slide" transparent visible={parcelModalOpen} onRequestClose={() => setParcelModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
          <Pressable style={styles.overlay} onPress={() => setParcelModalOpen(false)}><Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHead}><View><Text style={styles.kicker}>Parcel Collection</Text><Text style={styles.drawerTitle}>Pending Parcels</Text></View><Pressable onPress={() => setParcelModalOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}><Ionicons name="close-circle-outline" size={26} color="#6B8E7B" /></Pressable></View>
            <ParcelList busy={busy} parcelFilter={parcelFilter} setParcelFilter={setParcelFilter} visibleParcels={visibleParcels} updateBill={updateBill} compact />
          </Pressable></Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal animationType="slide" transparent visible={parcelPayOpen} onRequestClose={() => setParcelPayOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
          <Pressable style={styles.overlay} onPress={() => setParcelPayOpen(false)}><Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHead}>
              <View>
                <Text style={styles.kicker}>Parcel Payment</Text>
                <Text style={styles.drawerTitle}>Slip {selectedBill?.billNumber || '-'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  disabled={busy || !selectedBill}
                  onPress={() => updateBill('/bills/reset', { billNumber: selectedBill?.billNumber }, true)}
                  style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(47, 67, 54, 0.10)' }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={{ color: '#2F4336', fontSize: 13, fontWeight: '800' }}>Reset Slip</Text>
                </Pressable>
                <Pressable onPress={() => setParcelPayOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}>
                  <Ionicons name="close-circle-outline" size={26} color="#6B8E7B" />
                </Pressable>
              </View>
            </View>
            <ParcelPayPanel bill={selectedBill} busy={busy} message={message} updateBill={(path, payload) => updateBill(path, payload, true)} />
          </Pressable></Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal animationType="slide" transparent visible={detailsOpen} onRequestClose={() => setDetailsOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
          <Pressable style={styles.overlay} onPress={() => setDetailsOpen(false)}><Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHead}><View><Text style={styles.kicker}>Slip Details</Text><Text style={styles.drawerTitle}>Bill {selectedBill?.billNumber || '-'}</Text></View><Pressable onPress={() => setDetailsOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}><Ionicons name="close-circle-outline" size={26} color="#6B8E7B" /></Pressable></View>
            <CompletedBillPanel bill={selectedBill} busy={busy} message={message} session={session} updateBill={(path, payload) => updateBill(path, payload, true)} />
          </Pressable></Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal animationType="slide" transparent visible={drawerOpen} onRequestClose={() => setDrawerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
          <Pressable style={styles.overlay} onPress={() => setDrawerOpen(false)}><Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHead}><View><Text style={styles.kicker}>Selected Bill</Text><Text style={styles.drawerTitle}>Bill {selectedBill?.billNumber || '-'}</Text></View><Pressable onPress={() => setDrawerOpen(false)} hitSlop={12} style={styles.cleanCloseIconButton}><Ionicons name="close-circle-outline" size={26} color="#6B8E7B" /></Pressable></View>
            <ActionPanel bill={selectedBill} busy={busy} message={message} parcelAmount={parcelAmount} setParcelAmount={setParcelAmount} updateBill={(path, payload) => updateBill(path, payload, true)} />
          </Pressable></Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>);

}

function Metric({ value, label }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function BillCell({ bill, selected, onPress, cardSize, paidColor, parcelColor }) {
  const isPaid = bill.status === 'paid' || bill.status === 'parcel_paid';
  const isParcelPending = bill.status === 'parcel_pending';
  const isParcelPaid = bill.status === 'parcel_paid';
  const isSheruParcel = bill.parcelType === 'sheru';
  const isSmall = cardSize === 'small';

  const lastTap = useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      onPress?.(true); // Double click -> force audit details
    } else {
      onPress?.(false);
    }
    lastTap.current = now;
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        isSmall && styles.cellSmall,
        isPaid && { backgroundColor: paidColor || '#DCFCE7', borderColor: '#2F4336' },
        isParcelPending && { backgroundColor: parcelColor || '#FEF08A', borderColor: '#CA8A04' },
        selected && styles.cellSelected,
      ]}
    >
      <View style={styles.cellNumberWrap}>
        <Text style={[styles.cellText, isSmall && styles.cellTextSmall]}>
          {bill.billNumber}
        </Text>
      </View>
      {isParcelPaid ? (
        <View style={[styles.cellTickWrap, isSmall && styles.cellTickWrapSmall]}>
          <Ionicons
            name={isSheruParcel ? 'checkmark-done' : 'checkmark'}
            size={isSmall ? 19 : 23}
            color="#2F4336"
          />
        </View>
      ) : null}
    </Pressable>
  );
}

function ActionPanel({ bill, busy, message, parcelAmount, setParcelAmount, updateBill }) {
  const disabled = !bill || busy;
  const isModified = bill && bill.status !== 'open';
  return <View style={styles.actionCard}>
    <Text style={styles.billStatus}>{bill ? bill.status.replace('_', ' ') : 'Select a bill number'}</Text>
    <View style={styles.actionRow}>
      <SmallButton disabled={disabled} label="Paid" color={theme.colors.accent} onPress={() => updateBill('/bills/paid', { billNumber: bill.billNumber })} />
      {isModified ? <SmallButton disabled={disabled} label="Reset" color={theme.colors.primary} onPress={() => updateBill('/bills/reset', { billNumber: bill.billNumber })} /> : null}
    </View>
    <Field label="Parcel amount" value={parcelAmount} onChangeText={setParcelAmount} placeholder="Rs" keyboardType="number-pad" />
    <View style={styles.parcelActionRow}><SmallButton disabled={disabled || !parcelAmount} label="Send Parcel" color={theme.colors.muted} onPress={() => updateBill('/bills/parcel', { billNumber: bill.billNumber, amount: Number(parcelAmount), parcelType: 'regular' })} /><SmallButton disabled={disabled || !parcelAmount} label="com. parcel" color={theme.colors.accent} onPress={() => updateBill('/bills/parcel', { billNumber: bill.billNumber, amount: Number(parcelAmount), parcelType: 'sheru' })} /></View>
    {message ? <Text style={styles.status}>{message}</Text> : null}
  </View>;
}

function CompletedBillPanel({ bill, busy, message, updateBill, session }) {
  const disabled = !bill || busy;
  const isParcel = bill?.status === 'parcel_paid';
  const typeLabel = bill?.parcelType === 'sheru' ? 'Com Parcel' : isParcel ? 'Parcel' : 'Paid Slip';
  const statusLabel = isParcel ? `${typeLabel} Paid` : 'Paid';

  const editedTime = bill?.updatedAt || bill?.paidAt || bill?.parcelPaidAt || bill?.parcelSentAt;
  const formattedTime = editedTime ? new Date(editedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
  const editorName = bill?.editor?.name || bill?.editorName;
  const editorUsername = bill?.editor?.username || '';
  const editorRole = bill?.editor?.role || (session?.issuperadmin ? 'Superadmin' : 'Cashier');

  return (
    <View style={[styles.actionCard, styles.completedCard]}>
      <View style={styles.completedSummary}>
        <Text style={styles.completedStatus}>{statusLabel}</Text>
        {isParcel && bill?.amount ? <Text style={styles.completedAmount}>Rs {bill.amount}</Text> : null}
        
        {/* Editor audit details for SuperAdmin */}
        {editorName ? (
          <View style={styles.auditCard}>
            <Text style={styles.auditHeader}>LAST EDITED BY</Text>
            <View style={styles.auditRow}>
              <Ionicons name="person-circle-outline" size={24} color="#2F4336" />
              <View style={{ flex: 1 }}>
                <Text style={styles.auditName}>{editorName} {editorUsername ? `(@${editorUsername})` : ''}</Text>
                <Text style={styles.auditRole}>Role: {editorRole}</Text>
              </View>
            </View>
            <View style={styles.auditTimeRow}>
              <Ionicons name="time-outline" size={14} color="#6B8E7B" />
              <Text style={styles.auditTimeText}>Edited at {formattedTime}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.completedHint}>This slip is already completed. Reset only if you need to correct it.</Text>
        )}
      </View>
      <SmallButton disabled={disabled} label="Reset" color={theme.colors.primary} onPress={() => updateBill('/bills/reset', { billNumber: bill.billNumber })} />
      {message ? <Text style={styles.status}>{message}</Text> : null}
    </View>
  );
}
function SmallButton({ color, disabled, label, onPress }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.smallBtn, { backgroundColor: color }, disabled && styles.disabled]}><Text style={styles.smallBtnText}>{label}</Text></Pressable>;
}

function ParcelPayPanel({ bill, busy, message, updateBill, session }) {
  const disabled = !bill || busy;
  const editedTime = bill?.updatedAt || bill?.parcelSentAt || bill?.paidAt;
  const formattedTime = editedTime ? new Date(editedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
  const editorName = bill?.editor?.name || bill?.editorName;
  const editorUsername = bill?.editor?.username || '';
  const editorRole = bill?.editor?.role || (session?.issuperadmin ? 'Superadmin' : 'Cashier');

  return <View style={[styles.actionCard, styles.parcelPayCard]}>
    <Text style={styles.parcelPayKicker}>{bill?.parcelType === 'sheru' ? 'Commission parcel' : 'Parcel payment'}</Text>
    <View style={styles.parcelPaySummary}>
      <View>
        <Text style={styles.parcelPaySlip}>Slip {bill?.billNumber || '-'}</Text>
        <Text style={styles.parcelPayMeta}>{bill?.parcelType === 'sheru' ? 'Sheru parcel' : 'Regular parcel'}</Text>
      </View>
      <Text style={styles.parcelPayAmount}>Rs {Number(bill?.amount || 0).toFixed(0)}</Text>
    </View>
    {editorName ? (
      <View style={styles.auditCard}>
        <Text style={styles.auditHeader}>PARCEL CREATED BY</Text>
        <View style={styles.auditRow}>
          <Ionicons name="person-circle-outline" size={24} color="#2F4336" />
          <View style={{ flex: 1 }}>
            <Text style={styles.auditName}>{editorName} {editorUsername ? `(@${editorUsername})` : ''}</Text>
            <Text style={styles.auditRole}>Role: {editorRole}</Text>
          </View>
        </View>
        <View style={styles.auditTimeRow}>
          <Ionicons name="time-outline" size={14} color="#6B8E7B" />
          <Text style={styles.auditTimeText}>Created at {formattedTime}</Text>
        </View>
      </View>
    ) : null}
    <View style={styles.actionRow}>
      <SmallButton disabled={disabled} label="Paid" color={theme.colors.accent} onPress={() => updateBill('/bills/parcel-paid', { billNumber: bill.billNumber })} />
    </View>
    {message ? <Text style={styles.status}>{message}</Text> : null}
  </View>;
}

function ParcelList({ busy, parcelFilter, setParcelFilter, updateBill, visibleParcels }) {
  return <ScrollView contentContainerStyle={styles.pagePad}><View style={styles.panel}>
    <View style={styles.parcelHead}><Text style={styles.panelTitle}>Parcel Slips</Text><View style={styles.filter}><Pressable onPress={() => setParcelFilter('pending')} style={[styles.filterBtn, parcelFilter === 'pending' && styles.filterActive]}><Text style={[styles.filterText, parcelFilter === 'pending' && styles.filterTextActive]}>Pending</Text></Pressable><Pressable onPress={() => setParcelFilter('paid')} style={[styles.filterBtn, parcelFilter === 'paid' && styles.filterActive]}><Text style={[styles.filterText, parcelFilter === 'paid' && styles.filterTextActive]}>Paid</Text></Pressable></View></View>
    {visibleParcels.length === 0 ? <Text style={styles.empty}>No {parcelFilter} parcel slips for this date.</Text> : null}
    {visibleParcels.map((bill) => <View style={styles.parcelRow} key={bill.billNumber}><View><Text style={styles.parcelSlip}>Slip {bill.billNumber}</Text><Text style={styles.parcelAmt}>Rs {Number(bill.amount).toFixed(0)}{bill.parcelType === 'sheru' ? ' - Sheru' : ''}</Text></View><Pressable disabled={busy} onPress={() => updateBill('/bills/parcel-paid', { billNumber: bill.billNumber })} style={[styles.markPaid, bill.status === 'parcel_paid' && styles.markDone]}><Text style={styles.markPaidText}>{bill.status === 'parcel_paid' ? 'Paid' : 'Mark paid'}</Text></Pressable></View>)}
  </View></ScrollView>;
}

function UsersPage({ session, userViewMode = 'list' }) {
  const emptyForm = { name: '', username: '', password: '', issuperadmin: false, isActive: true };
  const [users, setUsers] = useState([]);
  const [activeUserMenu, setActiveUserMenu] = useState(null); // id of user whose menu is open
  const [form, setForm] = useState(emptyForm);
  const [editingUser, setEditingUser] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadUsers() {
    setBusy(true);
    setMessage('');
    try {
      const data = await api('/users', { headers: { 'x-superadmin-id': String(session.id) } });
      setUsers(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function openAddPanel() {
    setEditingUser(null);
    setForm(emptyForm);
    setPanelOpen(true);
  }

  function openEditPanel(user) {
    setEditingUser(user);
    setForm({ name: user.name, username: user.username, password: '', issuperadmin: Boolean(user.issuperadmin), isActive: Boolean(user.isActive) });
    setPanelOpen(true);
  }

  async function saveUser() {
    const name = String(form.name || '').trim();
    const username = String(form.username || '').trim().toLowerCase();
    const password = String(form.password || '');

    if (!name || !username || (!editingUser && !password)) {
      return setMessage('Name, username, and password are required.');
    }
    setBusy(true);
    setMessage('');
    try {
      const body = { ...form, name, username, password };
      if (editingUser && !password) delete body.password;
      const saved = editingUser ?
        await api(`/users/${editingUser.id}`, { method: 'PATCH', headers: { 'x-superadmin-id': String(session.id) }, body }) :
        await api('/users', { method: 'POST', headers: { 'x-superadmin-id': String(session.id) }, body });
      setUsers((current) => editingUser ? current.map((user) => user.id === saved.id ? saved : user) : [...current, saved]);
      setPanelOpen(false);
      setForm(emptyForm);
      setEditingUser(null);
    } catch (error) {
      setMessage(typeof error === 'string' ? error : error?.message || 'Failed to save user.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user) {
    setBusy(true);
    setMessage('');
    try {
      const saved = await api(`/users/${user.id}`, { method: 'PATCH', headers: { 'x-superadmin-id': String(session.id) }, body: { isActive: !user.isActive } });
      setUsers((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(user) {
    setDeleteTarget(user);
  }

  async function deleteUser(user) {
    setBusy(true);
    setMessage('');
    try {
      await api(`/users/${user.id}`, { method: 'DELETE', headers: { 'x-superadmin-id': String(session.id) } });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setDeleteTarget(null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ScrollView contentContainerStyle={styles.pagePad}>
      <View style={styles.userHeader}>
        <View>
          <Text style={styles.panelTitle}>Users</Text>
          <Text style={styles.userSubText}>{users.length} accounts</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={openAddPanel} style={styles.addUserBtn}>
            <Text style={styles.addUserText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {message ? <Text style={styles.status}>{message}</Text> : null}
      {busy && users.length === 0 ? <ActivityIndicator color={theme.colors.accent} /> : null}

      {/* RENDER LIST VIEW OR KANBAN GRID VIEW */}
      {userViewMode === 'list' ? (
        <View style={styles.userListWrap}>
          {users.map((user) => {
            const menuOpen = activeUserMenu === user.id;
            return (
              <View style={styles.userCleanListCard} key={user.id}>
                <View style={styles.userCleanListMain}>
                  {/* Avatar & Left Info: Name & Username */}
                  <View style={styles.userCleanLeft}>
                    <View style={[styles.userAvatar, !user.isActive && styles.userAvatarOff]}>
                      <Text style={styles.userAvatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.userCleanName} numberOfLines={1}>{user.name}</Text>
                      <Text style={styles.userCleanUsername} numberOfLines={1}>@{user.username}</Text>
                    </View>
                  </View>

                  {/* Far Right: Role Badge & 3-dots Menu Button */}
                  <View style={styles.userCleanRight}>
                    <View style={styles.userBadge}>
                      <Text style={styles.userBadgeText}>{user.issuperadmin ? 'Superadmin' : 'Admin'}</Text>
                    </View>
                    <View style={[styles.userStatusDot, user.isActive ? styles.userStatusDotOn : styles.userStatusDotOff]} />

                    <Pressable
                      onPress={() => setActiveUserMenu((prev) => (prev === user.id ? null : user.id))}
                      style={styles.userMenuBtn}
                      hitSlop={8}
                    >
                      <Ionicons name={menuOpen ? 'chevron-up-circle' : 'ellipsis-vertical'} size={18} color={theme.colors.primary} />
                    </Pressable>
                  </View>
                </View>

                {/* Dropdown Action Bar (Shows when 3-dots is toggled) */}
                {menuOpen ? (
                  <View style={styles.userDropdownBar}>
                    <Pressable
                      onPress={() => {
                        setActiveUserMenu(null);
                        openEditPanel(user);
                      }}
                      style={styles.userDropdownAction}
                    >
                      <Ionicons name="create-outline" size={15} color={theme.colors.primary} />
                      <Text style={styles.userDropdownText}>Edit</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setActiveUserMenu(null);
                        toggleActive(user);
                      }}
                      style={styles.userDropdownAction}
                    >
                      <Ionicons name={user.isActive ? 'pause-circle-outline' : 'play-circle-outline'} size={15} color={theme.colors.primary} />
                      <Text style={styles.userDropdownText}>{user.isActive ? 'Pause / Inactive' : 'Activate'}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setActiveUserMenu(null);
                        confirmDelete(user);
                      }}
                      style={[styles.userDropdownAction, styles.userDropdownActionDanger]}
                    >
                      <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                      <Text style={[styles.userDropdownText, { color: theme.colors.danger }]}>Delete</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.userGrid}>
          {users.map((user) => (
            <View style={styles.userCard} key={user.id}>
              <View style={styles.userCardTop}>
                <View style={[styles.userAvatar, !user.isActive && styles.userAvatarOff]}>
                  <Text style={styles.userAvatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.userBadge}>
                  <Text style={styles.userBadgeText}>{user.issuperadmin ? 'Super' : 'Admin'}</Text>
                </View>
              </View>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userUsername}>@{user.username}</Text>
              <Text style={[styles.userStatus, user.isActive ? styles.userStatusOn : styles.userStatusOff]}>
                {user.isActive ? 'Active' : 'Inactive'}
              </Text>
              <View style={styles.userActions}>
                <Pressable onPress={() => openEditPanel(user)} style={styles.userActionBtn}>
                  <Text style={styles.userActionText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => toggleActive(user)} style={styles.userActionBtn}>
                  <Text style={styles.userActionText}>{user.isActive ? 'Inactive' : 'Active'}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => confirmDelete(user)} style={styles.deleteUserBtn}>
                <Text style={styles.deleteUserText}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
    <Modal animationType="fade" transparent visible={Boolean(deleteTarget)} onRequestClose={() => setDeleteTarget(null)}>
      <Pressable style={styles.centerOverlay} onPress={() => setDeleteTarget(null)}><Pressable style={[styles.logoutConfirmCard, styles.deleteConfirmCard]} onPress={(event) => event.stopPropagation()}>
        <View style={styles.deleteConfirmIcon}><Text style={styles.deleteConfirmIconText}>!</Text></View>
        <Text style={styles.logoutConfirmTitle}>Delete User?</Text>
        <Text style={styles.logoutConfirmText}>This will permanently remove {deleteTarget?.name || 'this user'} from the app.</Text>
        <View style={styles.logoutConfirmActions}>
          <Pressable onPress={() => setDeleteTarget(null)} style={styles.cancelLogoutBtn}><Text style={styles.cancelLogoutText}>Cancel</Text></Pressable>
          <Pressable disabled={busy} onPress={() => deleteTarget && deleteUser(deleteTarget)} style={[styles.deleteConfirmBtn, busy && styles.disabled]}><Text style={styles.confirmLogoutText}>Delete</Text></Pressable>
        </View>
      </Pressable></Pressable>
    </Modal>
    <Modal animationType="slide" transparent visible={panelOpen} onRequestClose={() => setPanelOpen(false)}>
      <Pressable style={styles.sideOverlay} onPress={() => setPanelOpen(false)}><Pressable style={styles.sidePanel} onPress={(event) => event.stopPropagation()}>
        <View style={styles.drawerHead}><View><Text style={styles.kicker}>{editingUser ? 'Edit User' : 'Add User'}</Text><Text style={styles.drawerTitle}>{editingUser ? editingUser.name : 'New User'}</Text></View><Pressable onPress={() => setPanelOpen(false)} style={styles.closeBtn}><Text style={styles.closeText}>Close</Text></Pressable></View>
        <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Admin name" />
        <Field label="Username" value={form.username} onChangeText={(username) => setForm({ ...form, username })} placeholder="admin_username" autoCapitalize="none" />
        <Field label="Password" value={form.password} onChangeText={(password) => setForm({ ...form, password })} placeholder={editingUser ? 'Leave blank to keep same' : 'Temporary password'} secureTextEntry />
        <Pressable onPress={() => setForm({ ...form, issuperadmin: !form.issuperadmin })} style={styles.checkRow}><View style={[styles.box, form.issuperadmin && styles.boxOn]}>{form.issuperadmin ? <Text style={styles.boxText}>{'\u2713'}</Text> : null}</View><Text style={styles.optionText}>Superadmin access</Text></Pressable>
        <Pressable onPress={() => setForm({ ...form, isActive: !form.isActive })} style={styles.checkRow}><View style={[styles.box, form.isActive && styles.boxOn]}>{form.isActive ? <Text style={styles.boxText}>{'\u2713'}</Text> : null}</View><Text style={styles.optionText}>Active user</Text></Pressable>
        <Pressable disabled={busy} onPress={saveUser} style={[styles.primaryBtn, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving...' : editingUser ? 'Save changes' : 'Create user'}</Text></Pressable>
      </Pressable></Pressable>
    </Modal>
  </>;
}

function createAppStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    loginSafe: { flex: 1, backgroundColor: theme.colors.background },
    loginGradient: { ...StyleSheet.absoluteFillObject },
    classicBlobTop: { position: 'absolute', top: -42, left: -28, width: 210, height: 210, borderRadius: 105, backgroundColor: rgba(theme.colors.accentLight, 0.72) },
    classicBlobBottom: { position: 'absolute', right: -64, bottom: -60, width: 230, height: 230, borderRadius: 115, backgroundColor: rgba(theme.colors.lightBackground, 0.95) },
    loginKeyboard: { flex: 1 },
    loginWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 34, paddingBottom: 280 },
    card: { paddingHorizontal: 24, paddingVertical: 30, borderRadius: 26, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.14), shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.16, shadowRadius: 28, elevation: 8 },
    brandName: { color: theme.colors.primary, fontSize: 31, fontWeight: '500', textAlign: 'center', marginBottom: 16 },
    cardTitle: { color: theme.colors.primary, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
    cardHint: { color: theme.colors.muted, fontSize: 14, textAlign: 'center', marginBottom: 24, fontWeight: '500' },
    segment: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 22, backgroundColor: rgba(theme.colors.accentLight, 0.72), marginBottom: 22 },
    segmentBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    segmentActive: { backgroundColor: theme.colors.accent },
    segmentText: { color: theme.colors.muted, fontSize: 13, fontWeight: '800' },
    segmentTextActive: { color: theme.colors.white },
    field: { marginBottom: 14 },
    label: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 7, marginLeft: 16 },
    input: { height: 50, paddingHorizontal: 20, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.18), borderRadius: 25, color: theme.colors.primary, backgroundColor: theme.colors.background, fontSize: 15 },
    forgotText: { color: theme.colors.accent, fontSize: 13, fontWeight: '800' },
    primaryBtn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 5 },
    primaryText: { color: theme.colors.white, fontSize: 15, fontWeight: '900' },
    disabled: { opacity: 0.55 },
    shell: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
    topbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, paddingHorizontal: 4 },
    topText: { flex: 1, minWidth: 0 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    roleLine: { color: theme.colors.accent, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
    userLine: { color: theme.colors.primary, fontSize: 17, fontWeight: '700', marginTop: 2 },
    noteBtn: { shrink: 0, height: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.accent, 0.12), borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.18) },
    noteBtnText: { color: '#B76E79', fontSize: 13, fontWeight: '800' },
    noteIcon: { color: theme.colors.accent, fontSize: 13, fontWeight: '800' },
    logout: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
    logoutIcon: { color: theme.colors.white, fontSize: 17, fontWeight: '900', lineHeight: 20 },
    tabs: { flexDirection: 'row', gap: 6, padding: 5, marginBottom: 14, borderRadius: 24, backgroundColor: rgba(theme.colors.accentLight, 0.72) },
    flowTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    tab: { flex: 1, minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 0, backgroundColor: theme.colors.transparent },
    tabActive: { backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 3 },
    tabText: { color: theme.colors.muted, fontSize: 14, fontWeight: '800' },
    tabTextActive: { color: theme.colors.white },
    card: { minHeight: 0, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 26, borderTopLeftRadius: 38, borderTopRightRadius: 38, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, backgroundColor: theme.colors.lightBackground, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 10 },
    cardTitle: { color: theme.colors.accent, fontSize: 29, fontWeight: '900', marginBottom: 8 },
    cardHint: { color: theme.colors.muted, fontSize: 14, marginBottom: 24, fontWeight: '800' },
    segment: { flexDirection: 'row', gap: 6, padding: 5, borderRadius: 28, backgroundColor: theme.colors.accentSoft, marginBottom: 28 },
    segmentBtn: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 27 },
    segmentActive: { backgroundColor: theme.colors.accent },
    segmentText: { color: theme.colors.muted, fontSize: 16, fontWeight: '900' },
    segmentTextActive: { color: theme.colors.white },
    field: { marginBottom: 22 },
    label: { color: theme.colors.accent, fontSize: 16, fontWeight: '900', marginBottom: 10 },
    input: { height: 56, paddingHorizontal: 20, borderWidth: 0, borderRadius: 28, color: theme.colors.primary, backgroundColor: theme.colors.background, fontSize: 17 },
    passwordWrap: { height: 56, flexDirection: 'row', alignItems: 'center', borderRadius: 28, backgroundColor: theme.colors.background, overflow: 'hidden' },
    passwordInput: { flex: 1, height: 56, paddingLeft: 20, paddingRight: 10, color: theme.colors.primary, fontSize: 17 },
    eyeBtn: { height: 48, width: 52, marginRight: 6, alignItems: 'center', justifyContent: 'center' },
    loginOptionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -8, marginBottom: 10 },
    rememberRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
    rememberBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: rgba(theme.colors.accent, 0.34), alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.white, 0.72) },
    rememberBoxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    rememberTick: { color: theme.colors.white, fontSize: 13, fontWeight: '900', lineHeight: 15 },
    rememberText: { color: theme.colors.muted, fontSize: 13, fontWeight: '800' },
    primaryBtn: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, marginTop: 18 },
    primaryText: { color: theme.colors.white, fontSize: 18, fontWeight: '900' },
    disabled: { opacity: 0.55 },
    pagePad: { paddingBottom: 28 },
    slipScreen: { flex: 1 },
    gridScroller: { flex: 1 },
    gridScrollContent: { paddingBottom: 2 },
    rangePager: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 8, paddingBottom: 8 },
    rangeArrowBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent },
    rangeArrowDisabled: { backgroundColor: rgba(theme.colors.accentLight, 0.78) },
    rangeLabelPill: { minWidth: 110, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, paddingHorizontal: 18 },
    rangeTextActive: { color: theme.colors.white, fontSize: 14, fontWeight: '900' },
    filterPanel: { gap: 8, marginBottom: 12 },
    filterRow: { flexDirection: 'row', gap: 8 },
    toolbar: { gap: 10, marginBottom: 12 },
    metric: { flex: 1, minHeight: 58, padding: 10, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.13), borderRadius: 16, backgroundColor: theme.colors.background },
    parcelPendingMetric: { flex: 1, minHeight: 58, padding: 10, borderRadius: 16, backgroundColor: theme.colors.accent, justifyContent: 'center' },
    parcelPendingValue: { color: theme.colors.white, fontSize: 18, fontWeight: '800' },
    parcelPendingLabel: { color: rgba(theme.colors.white, 0.82), fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
    metricValue: { color: theme.colors.primary, fontSize: 18, fontWeight: '800' },
    metricLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
    dateInput: { minHeight: 34, color: theme.colors.primary, fontSize: 16, fontWeight: '800' },
    dateFilter: { flex: 1, minHeight: 64, padding: 11, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.13), borderRadius: 18, backgroundColor: theme.colors.background, justifyContent: 'center' },
    dateValue: { color: theme.colors.accent, fontSize: 16, fontWeight: '800', marginTop: 5 },
    sheruMetric: { minHeight: 58, padding: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.lightBackground, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    comFilter: { flex: 2, minHeight: 64, padding: 11, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.13), borderRadius: 18, backgroundColor: theme.colors.background, flexDirection: 'row', alignItems: 'center', position: 'relative' },
    comSide: { width: '50%', paddingRight: 12 },
    comSideRight: { alignItems: 'flex-end', paddingRight: 0, paddingLeft: 12 },
    comDivider: { position: 'absolute', left: '50%', top: 12, bottom: 12, width: 1.5, backgroundColor: rgba(theme.colors.accent, 0.22), borderRadius: 1 },
    pipe: { color: theme.colors.danger, fontSize: 26, fontWeight: '900' },
    refresh: { height: 36, borderRadius: 18, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    refreshText: { color: theme.colors.white, fontWeight: '900' },
    status: { padding: 11, borderRadius: 8, color: theme.colors.primary, backgroundColor: theme.colors.lightBackground, marginTop: 12, marginBottom: 12, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
    cell: { width: '31.2%', aspectRatio: 1.08, minHeight: 76, borderWidth: 1.6, borderColor: 'rgba(47, 67, 54, 0.15)', borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', position: 'relative' },
    cellGreen: { backgroundColor: '#DCFCE7', borderColor: '#2F4336' },
    cellMustard: { backgroundColor: '#FEF08A', borderColor: '#CA8A04' },
    cellSelected: { borderColor: '#B76E79', borderWidth: 3.5 },
    cellNumberWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    cellText: { color: '#2F4336', fontSize: 27, fontWeight: '900', lineHeight: 30, textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' },
    cellTextColored: { color: '#2F4336' },
    cellTickWrap: { position: 'absolute', top: 6, right: 7 },
    modalKeyboard: { flex: 1 },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: rgba(theme.colors.primary, 0.42) },
    centerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: rgba(theme.colors.primary, 0.42) },
    logoutConfirmCard: { width: '100%', maxWidth: 360, padding: 22, borderRadius: 28, backgroundColor: theme.colors.lightBackground, borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.16), alignItems: 'center', shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 10 },
    logoutConfirmIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.accent, 0.12), borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.18), marginBottom: 14 },
    logoutConfirmIconText: { color: theme.colors.accent, fontSize: 24, fontWeight: '900', lineHeight: 28 },
    deleteConfirmCard: { borderColor: rgba(theme.colors.danger, 0.18) },
    deleteConfirmIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.danger, 0.10), borderWidth: 1, borderColor: rgba(theme.colors.danger, 0.20), marginBottom: 14 },
    deleteConfirmIconText: { color: theme.colors.danger, fontSize: 28, fontWeight: '900', lineHeight: 31 },
    deleteConfirmBtn: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.danger, shadowColor: theme.colors.danger, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
    logoutConfirmTitle: { color: theme.colors.primary, fontSize: 26, fontWeight: '900', marginBottom: 6 },
    logoutConfirmText: { color: theme.colors.muted, fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
    logoutConfirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
    cancelLogoutBtn: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.accent, 0.10), borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.16) },
    cancelLogoutText: { color: theme.colors.accent, fontSize: 15, fontWeight: '900' },
    confirmLogoutBtn: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
    confirmLogoutText: { color: theme.colors.white, fontSize: 15, fontWeight: '900' },
    drawer: { maxHeight: '82%', padding: 18, paddingBottom: 26, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.colors.lightBackground, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.12) },
    drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    kicker: { color: theme.colors.accent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
    drawerTitle: { color: theme.colors.primary, fontSize: 32, fontWeight: '800', marginTop: 4 },
    closeBtn: { minHeight: 42, paddingHorizontal: 16, borderRadius: 16, backgroundColor: theme.colors.primary, justifyContent: 'center' },
    closeText: { color: theme.colors.white, fontWeight: '900' },
    actionCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.13), borderRadius: 18, backgroundColor: theme.colors.background },
    completedCard: { gap: 14 },
    completedSummary: { padding: 14, borderRadius: 18, backgroundColor: rgba(theme.colors.accent, 0.08), borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.14) },
    completedStatus: { color: theme.colors.primary, fontSize: 24, fontWeight: '900' },
    completedAmount: { color: theme.colors.accent, fontSize: 20, fontWeight: '900', marginTop: 8 },
    completedHint: { color: theme.colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 10 },
    noteCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.16), borderRadius: 18, backgroundColor: theme.colors.lightBackground },
    noteDate: { color: theme.colors.accent, fontSize: 14, fontWeight: '900' },
    noteInputWrap: { minHeight: 220, borderRadius: 18, borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.14), backgroundColor: theme.colors.background, overflow: 'hidden', position: 'relative' },
    noteDivider: { position: 'absolute', top: 14, bottom: 14, left: '50%', width: 1, backgroundColor: rgba(theme.colors.accent, 0.16) },
    noteInput: { position: 'absolute', top: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, color: theme.colors.primary, fontSize: 16, lineHeight: 40, textAlignVertical: 'top', backgroundColor: theme.colors.transparent },
    noteInputLeft: { left: 0, width: '50%' },
    noteInputRight: { right: 0, width: '50%' },
    noteSaveBtn: { alignSelf: 'center', minWidth: 170, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
    noteSaveText: { color: theme.colors.white, fontSize: 15, fontWeight: '900' },
    billStatus: { color: theme.colors.muted, fontSize: 18, fontWeight: '600', textTransform: 'capitalize' },
    parcelPayCard: { backgroundColor: theme.colors.lightBackground, borderColor: rgba(theme.colors.accent, 0.16) },
    parcelPayKicker: { color: theme.colors.accent, fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
    parcelPaySummary: { padding: 14, borderRadius: 18, backgroundColor: rgba(theme.colors.accent, 0.08), borderWidth: 1, borderColor: rgba(theme.colors.accent, 0.14), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    parcelPaySlip: { color: theme.colors.primary, fontSize: 26, fontWeight: '900' },
    parcelPayMeta: { color: theme.colors.muted, fontSize: 13, fontWeight: '700', marginTop: 3 },
    parcelPayAmount: { color: theme.colors.accent, fontSize: 22, fontWeight: '900' },
    actionRow: { flexDirection: 'row', gap: 8 },
    parcelActionRow: { flexDirection: 'row', gap: 8 },
    smallBtn: { minHeight: 46, flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    smallBtnText: { color: theme.colors.white, fontWeight: '900', fontSize: 14 },
    panel: { padding: 16, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.13), borderRadius: 18, backgroundColor: theme.colors.background },
    userHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    userSubText: { color: theme.colors.muted, fontSize: 13, fontWeight: '700', marginTop: -8 },
    addUserBtn: { minHeight: 42, paddingHorizontal: 18, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent },
    addUserText: { color: theme.colors.white, fontSize: 15, fontWeight: '900' },
    userGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    userCard: { width: '48.5%', padding: 12, borderRadius: 18, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.13), backgroundColor: theme.colors.background },
    userCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent },
    userAvatarOff: { backgroundColor: theme.colors.placeholder },
    userAvatarText: { color: theme.colors.white, fontSize: 18, fontWeight: '900' },
    userBadge: { paddingHorizontal: 8, minHeight: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.accent, 0.10) },
    userBadgeText: { color: theme.colors.accent, fontSize: 11, fontWeight: '900' },
    userName: { color: theme.colors.primary, fontSize: 18, fontWeight: '900' },
    userUsername: { color: theme.colors.muted, fontSize: 13, fontWeight: '700', marginTop: 2 },
    userStatus: { alignSelf: 'flex-start', marginTop: 9, marginBottom: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, fontSize: 11, fontWeight: '900', overflow: 'hidden' },
    userStatusOn: { color: theme.colors.accent, backgroundColor: theme.colors.successSoft },
    userStatusOff: { color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft },
    userActions: { flexDirection: 'row', gap: 6, marginBottom: 7 },
    userActionBtn: { flex: 1, minHeight: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: rgba(theme.colors.accent, 0.10) },
    userActionText: { color: theme.colors.accent, fontSize: 12, fontWeight: '900' },
    deleteUserBtn: { minHeight: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary },
    deleteUserText: { color: theme.colors.white, fontSize: 12, fontWeight: '900' },
    leftOverlay: { flex: 1, alignItems: 'flex-start', backgroundColor: rgba(theme.colors.primary, 0.42) },
    leftPanel: { width: '86%', maxWidth: 340, height: '100%', padding: 18, paddingTop: 34, backgroundColor: theme.colors.lightBackground, borderTopRightRadius: 30, borderBottomRightRadius: 30, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.12), shadowColor: theme.colors.primary, shadowOffset: { width: 12, height: 0 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 12 },
    profileHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
    profileAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
    profileAvatarText: { color: theme.colors.white, fontSize: 24, fontWeight: '900' },
    profileTitleWrap: { flex: 1 },
    profileName: { color: theme.colors.primary, fontSize: 22, fontWeight: '900' },
    profileRole: { color: theme.colors.accent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 3 },
    profileInfoCard: { padding: 15, borderRadius: 20, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.10), backgroundColor: theme.colors.background, marginBottom: 20 },
    profileInfoLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
    profileInfoValue: { color: theme.colors.primary, fontSize: 17, fontWeight: '900', marginTop: 5 },
    profileDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 13 },
    profileSectionLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
    themeOptions: { gap: 10 },
    themeChoice: { minHeight: 58, borderRadius: 18, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.10), backgroundColor: theme.colors.background, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
    themeChoiceActive: { borderColor: theme.colors.accent, backgroundColor: rgba(theme.colors.accent, 0.08) },
    themeSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.12) },
    themeChoiceName: { flex: 1, color: theme.colors.primary, fontSize: 14, fontWeight: '900' }, sideOverlay: { flex: 1, alignItems: 'flex-end', backgroundColor: rgba(theme.colors.primary, 0.42) },
    sidePanel: { width: '88%', height: '100%', padding: 18, paddingTop: 32, backgroundColor: theme.colors.lightBackground, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, borderWidth: 1, borderColor: rgba(theme.colors.primary, 0.12) },
    panelTitle: { color: theme.colors.primary, fontSize: 28, fontWeight: '800', marginBottom: 14 },
    parcelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 10, marginBottom: 6 },
    filter: { flexDirection: 'row', gap: 4, padding: 3, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.lightBackground },
    filterBtn: { minHeight: 30, paddingHorizontal: 9, borderRadius: 6, justifyContent: 'center' },
    filterActive: { backgroundColor: theme.colors.accent },
    filterText: { color: theme.colors.muted, fontSize: 12, fontWeight: '900' },
    filterTextActive: { color: theme.colors.white },
    empty: { color: theme.colors.muted, paddingVertical: 14 },
    parcelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.border },
    parcelSlip: { color: theme.colors.primary, fontSize: 22, fontWeight: '800' },
    parcelAmt: { color: theme.colors.muted, fontSize: 14, marginTop: 3 },
    markPaid: { minHeight: 46, minWidth: 112, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.danger },
    markDone: { backgroundColor: theme.colors.accent },
    markPaidText: { color: theme.colors.white, fontWeight: '900', fontSize: 13 },
    checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: theme.colors.softBorder, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    boxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    boxText: { color: theme.colors.white, fontSize: 13, fontWeight: '900' },
    optionText: { color: theme.colors.muted, fontSize: 14 },
    splashContainer: {
      flex: 1,
      backgroundColor: '#1E2F25',
    },
    splashBg: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    splashSafeArea: {
      flex: 1,
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 130,
      paddingBottom: 48,
    },
    splashLogoBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    splashTitle: {
      fontSize: 40,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 7,
      textTransform: 'uppercase',
      textAlign: 'center',
      marginBottom: 2,
    },
    splashSubtitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.accent,
      letterSpacing: 9,
      textTransform: 'uppercase',
      textAlign: 'center',
      marginTop: 0,
    },
    splashFooterBox: {
      alignItems: 'center',
    },
    splashFooterText: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.colors.accentLight,
      letterSpacing: 4,
      textTransform: 'uppercase',
    },
    cleanLoginSafe: { flex: 1, backgroundColor: '#F7F4F0', position: 'relative' },
    ambientMeshContainer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
    loginOrb1: { position: 'absolute', top: -40, left: -40, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(55, 71, 62, 0.12)' },
    loginOrb2: { position: 'absolute', bottom: -60, right: -40, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(74, 93, 82, 0.08)' },
    loginOrb3: { position: 'absolute', top: '38%', right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(184, 90, 50, 0.07)' },
    cleanLoginKeyboard: { flex: 1 },
    cleanLoginScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 36 },
    cleanLoginHeader: { alignItems: 'center', marginBottom: 28 },
    cleanBrandTitle: { fontSize: 34, fontWeight: '900', color: theme.colors.primary, letterSpacing: 6, textTransform: 'uppercase', textAlign: 'center' },
    cleanBrandSub: { fontSize: 13, fontWeight: '800', color: theme.colors.accent, letterSpacing: 7, textTransform: 'uppercase', textAlign: 'center', marginTop: 3 },
    cleanTagline: { fontSize: 13, fontWeight: '600', color: theme.colors.muted, textAlign: 'center', marginTop: 8, letterSpacing: 0.2 },
    cleanFormContainer: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, borderWidth: 1.5, borderColor: '#D8C3B5', shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6 },
    cleanSegment: { flexDirection: 'row', backgroundColor: '#F7F4F0', borderRadius: 14, padding: 4, marginBottom: 24, borderWidth: 1, borderColor: '#EFE7E1' },
    cleanSegmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 10 },
    cleanSegmentActive: { backgroundColor: theme.colors.primary },
    cleanSegmentText: { fontSize: 14, fontWeight: '800', color: theme.colors.muted },
    cleanSegmentTextActive: { color: '#FFFFFF' },
    cleanInputGroup: { marginBottom: 18 },
    cleanLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, marginBottom: 7 },
    cleanInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF7F4', borderRadius: 14, borderWidth: 1.5, borderColor: '#D8C3B5', height: 52, paddingHorizontal: 14 },
    cleanInputIcon: { marginRight: 10 },
    cleanTextInput: { flex: 1, color: theme.colors.primary, fontSize: 15, fontWeight: '600', height: '100%' },
    cleanEyeBtn: { padding: 6, marginLeft: 6 },
    cleanOptionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 2 },
    cleanRememberRow: { flexDirection: 'row', alignItems: 'center' },
    cleanRememberBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#7A8C82', alignItems: 'center', justifyContent: 'center', marginRight: 9, backgroundColor: '#FFFFFF' },
    cleanRememberBoxOn: { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary },
    cleanRememberText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
    cleanSubmitBtn: { backgroundColor: theme.colors.primary, borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 6, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
    cleanSubmitBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
    cleanBtnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    cleanSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
    cleanCloseIconButton: { padding: 4, alignItems: 'center', justifyContent: 'center' },
    profileHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
    headerAvatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
    cellSmall: { width: '23.2%', aspectRatio: 1.05, minHeight: 64, borderRadius: 14 },
    cellTextSmall: { fontSize: 21, lineHeight: 24 },
    cellTickWrapSmall: { top: 4, right: 5 },
    settingsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    settingsKicker: { color: theme.colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
    gridSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF7F4', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#D8C3B5', marginBottom: 20 },
    gridSwitchTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.primary },
    gridSwitchSub: { fontSize: 11, fontWeight: '600', color: theme.colors.muted, marginTop: 2 },
    switchTrack: { width: 52, height: 28, borderRadius: 14, backgroundColor: '#D8C3B5', padding: 2, justifyContent: 'center' },
    switchTrackOn: { backgroundColor: theme.colors.primary },
    switchThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 },
    switchThumbOn: { transform: [{ translateX: 24 }] },
    colorSwatchesRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    colorSwatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
    colorSwatchActive: { borderColor: theme.colors.accent, transform: [{ scale: 1.1 }] },
    settingsLogoutBtn: { marginTop: 22, height: 50, borderRadius: 16, backgroundColor: theme.colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: theme.colors.danger, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4 },
    settingsLogoutText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
    summaryToggleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#D8C3B5', paddingHorizontal: 12, height: 42, marginBottom: 12 },
    summaryToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    summaryToggleText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
    compactDateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.accentLight },
    compactDateText: { fontSize: 13, fontWeight: '800', color: theme.colors.accent },
    floatingLoadWrap: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'box-none' },
    floatingLoadBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 6, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.20)' },
    floatingLoadText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
    readMoreBtn: { marginTop: 1, marginBottom: 4, paddingVertical: 1, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    readMoreBtnPressed: { opacity: 0.6 },
    readMoreText: { color: theme.colors.primary, fontSize: 15, fontWeight: '900' },
    floatingBottomNav: { flexDirection: 'row', gap: 6, padding: 6, marginHorizontal: 16, marginBottom: 12, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D8C3B5', shadowColor: '#37473E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
    slimTabs: { flexDirection: 'row', gap: 6, padding: 4, marginBottom: 12, borderRadius: 16, backgroundColor: '#EFE7E1' },
    slimTab: { flex: 1, minHeight: 40, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    slimTabActive: { backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
    slimTabText: { color: '#7A8C82', fontSize: 13, fontWeight: '800' },
    slimTabTextActive: { color: '#FFFFFF' },
    dashContainer: { paddingBottom: 32 },
    dashBanner: { padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    dashBannerSub: { color: theme.colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    dashBannerTitle: { color: theme.colors.primary, fontSize: 19, fontWeight: '900', marginTop: 2 },
    dashLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.12)' },
    dashLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
    dashLiveText: { color: '#10B981', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
    dashKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 20 },
    dashKpiCard: { width: '48.5%', padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    dashKpiCardPrimary: { backgroundColor: '#FFFFFF', borderColor: theme.colors.accent, borderWidth: 1.5 },
    dashKpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    dashKpiLabel: { color: '#64748B', fontSize: 12, fontWeight: '800' },
    dashKpiIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    dashKpiValue: { color: theme.colors.primary, fontSize: 21, fontWeight: '900' },
    dashKpiTrend: { color: '#10B981', fontSize: 11, fontWeight: '700', marginTop: 4 },
    dashKpiHint: { color: '#64748B', fontSize: 11, fontWeight: '700', marginTop: 4 },
    dashSectionTitle: { color: theme.colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 10 },
    dashNavRow: { gap: 10, marginBottom: 20 },
    dashNavCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
    dashNavCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dashNavIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    dashNavTitle: { color: theme.colors.primary, fontSize: 15, fontWeight: '900' },
    dashNavSub: { color: '#64748B', fontSize: 12, fontWeight: '600', marginTop: 2 },
    dashHighlightBox: { marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dashHighlightLabel: { color: theme.colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    dashHighlightValue: { color: theme.colors.primary, fontSize: 11, fontWeight: '900' },
    dashChartCard: { padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
    dashChartHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
    dashChartTitle: { color: theme.colors.primary, fontSize: 13, fontWeight: '900', letterSpacing: 1.0 },
    periodPillRow: { flexDirection: 'row', gap: 4, backgroundColor: '#F1F5F9', padding: 3, borderRadius: 12 },
    periodPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: 'transparent' },
    periodPillActive: { backgroundColor: theme.colors.primary },
    periodPillText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
    periodPillTextActive: { color: '#FFFFFF' },
    dashBarChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 135, paddingTop: 10 },
    dashBarCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
    dashBarVal: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', marginBottom: 4 },
    dashBarTrack: { width: 14, height: '68%', backgroundColor: '#F1F5F9', borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end' },
    dashBarFill: { width: '100%', backgroundColor: theme.colors.accent, borderRadius: 7 },
    dashBarLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', marginTop: 6 },
    dashCompareList: { gap: 10 },
    compareCard: { padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
    compareCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    compareTitle: { color: theme.colors.primary, fontSize: 13, fontWeight: '800', flex: 1 },
    compareBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    compareBadgePos: { backgroundColor: 'rgba(16, 185, 129, 0.12)' },
    compareBadgeNeg: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
    compareBadgeText: { fontSize: 11, fontWeight: '900' },
    compareBadgeTextPos: { color: '#10B981' },
    compareBadgeTextNeg: { color: '#EF4444' },
    compareDataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    compareCol: { flex: 1 },
    compareDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0', marginHorizontal: 12 },
    compareColLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    compareColVal: { color: theme.colors.primary, fontSize: 15, fontWeight: '900', marginTop: 2 },
    compareColValMuted: { color: '#64748B', fontSize: 14, fontWeight: '700', marginTop: 2 },
    auditCard: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: theme.colors.accentSoft, borderWidth: 1, borderColor: theme.colors.accentLight },
    auditHeader: { color: theme.colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.0, marginBottom: 8 },
    auditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    auditName: { color: theme.colors.primary, fontSize: 14, fontWeight: '900' },
    auditRole: { color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 1 },
    auditTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    auditTimeText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
    editorCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
    editorAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
    editorAvatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    editorName: { color: theme.colors.primary, fontSize: 15, fontWeight: '900' },
    editorUsername: { color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 1 },
    editorBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: theme.colors.accentSoft },
    editorBadgeText: { color: theme.colors.accent, fontSize: 12, fontWeight: '900' },
    lineChartWrap: { height: 135, paddingTop: 10 },
    lineChartCanvas: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%' },
    lineCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
    lineTrack: { width: 2, height: '68%', backgroundColor: '#E2E8F0', alignItems: 'center', position: 'relative' },
    lineDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.accentLight, alignItems: 'center', justifyContent: 'center' },
    lineInnerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent },
    userListWrap: { gap: 10 },
    userCleanListCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8C3B5', overflow: 'hidden' },
    userCleanListMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
    userCleanLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, paddingRight: 8 },
    userCleanRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    userCleanName: { color: theme.colors.primary, fontSize: 15, fontWeight: '900' },
    userCleanUsername: { color: theme.colors.muted, fontSize: 12, fontWeight: '600', marginTop: 1 },
    userStatusDot: { width: 8, height: 8, borderRadius: 4 },
    userStatusDotOn: { backgroundColor: '#10B981' },
    userStatusDotOff: { backgroundColor: '#EF4444' },
    userMenuBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F7F4F0', alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
    userDropdownBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#FAF7F4', borderTopWidth: 1, borderTopColor: '#EFE7E1', paddingVertical: 10, paddingHorizontal: 8 },
    userDropdownAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8C3B5' },
    userDropdownActionDanger: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
    customCalContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1.5, borderColor: '#D8C3B5', padding: 14 },
    customCalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
    customCalNavBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FAF7F4', alignItems: 'center', justifyContent: 'center' },
    customCalMonthTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.primary },
    customCalDaysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    customCalDayLabel: { width: '13.5%', textAlign: 'center', fontSize: 11, fontWeight: '800', color: theme.colors.muted },
    customCalGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
    customCalCellEmpty: { width: '14.28%', height: 38 },
    customCalCell: { width: '14.28%', height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    customCalCellActive1: { backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 3 },
    customCalCellActive2: { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 3 },
    customCalCellCompare: { backgroundColor: '#EFE7E1', borderWidth: 1, borderColor: '#D8C3B5' },
    customCalCellText: { fontSize: 14, fontWeight: '800', color: theme.colors.primary },
    customCalCellTextActive: { color: '#FFFFFF', fontWeight: '900' },
    customCalCellTextCompare: { color: theme.colors.primary, fontWeight: '900' },
    calSegmentContainer: { flexDirection: 'row', gap: 8, backgroundColor: '#FAF7F4', padding: 4, borderRadius: 18, borderWidth: 1.5, borderColor: '#D8C3B5' },
    calSegmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'transparent' },
    calSegmentBtnActive1: { backgroundColor: theme.colors.accent },
    calSegmentBtnActive2: { backgroundColor: theme.colors.primary },
    calSegmentTitle: { fontSize: 10, fontWeight: '900', color: theme.colors.muted, letterSpacing: 0.8 },
    calSegmentVal: { fontSize: 13, fontWeight: '900', color: theme.colors.primary, marginTop: 1 },
    calSegmentTextActive: { color: '#FFFFFF' },
    calDirectWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#D8C3B5', height: 44, paddingHorizontal: 4 },
    calDirectInput: { flex: 1, color: theme.colors.primary, fontSize: 14, fontWeight: '700', paddingHorizontal: 8, height: '100%' },
    customDateSelectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: theme.colors.accentSoft, borderWidth: 1, borderColor: theme.colors.accentLight },
    customDateSelectText: { color: theme.colors.accent, fontSize: 12, fontWeight: '800' },
    dateInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1.5, borderColor: '#D8C3B5', height: 48, paddingHorizontal: 12 },
    dateTextInput: { flex: 1, color: theme.colors.primary, fontSize: 15, fontWeight: '700', height: '100%' },
    dateCalBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
    userListRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
    userListActionBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }
  });
}