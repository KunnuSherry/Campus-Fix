import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

type LoginTab = 'student' | 'staff';
type StudentMode = 'password' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithVerifiedData } = useAuth();

  // ── Tab selection ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<LoginTab>('student');

  // ── Student: mode (password vs OTP) ───────────────────────────
  const [studentMode, setStudentMode] = useState<StudentMode>('password');

  // ── Student Password flow ──────────────────────────────────────
  const [stuEmail, setStuEmail] = useState('');
  const [stuPassword, setStuPassword] = useState('');
  const [showStuPass, setShowStuPass] = useState(false);

  // ── Student OTP flow ───────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [collegeInfo, setCollegeInfo] = useState<{ id: string; name: string } | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // ── Staff login flow ───────────────────────────────────────────
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── Shared state ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Redirect by role ──────────────────────────────────────────
  const redirectByRole = (role: string) => {
    if (role === 'superadmin') {
      router.replace('/(superadmin)/colleges');
    } else if (role === 'admin') {
      router.replace('/(admin)/dashboard');
    } else if (role === 'rep') {
      router.replace('/(rep)/inbox');
    } else {
      router.replace('/(student)/assist');
    }
  };

  // ── Student: Password login ────────────────────────────────────
  const handleStudentPasswordLogin = async () => {
    if (!stuEmail.trim() || !stuPassword) {
      setErrorMessage('Please enter your email and password.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await api.studentLogin(stuEmail.trim(), stuPassword);
      await loginWithVerifiedData(res);
      redirectByRole(res.role);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Student: Step 1 — domain check + send OTP ─────────────────
  const handleCheckEmailAndSendOtp = async () => {
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid college email address.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const domainCheck = await api.checkDomain(email.trim());
      if (!domainCheck.allowed) {
        setErrorMessage(domainCheck.message);
        return;
      }
      setCollegeInfo({ id: domainCheck.college_id!, name: domainCheck.college_name! });
      const otpRes = await api.sendOtp(email.trim());
      setOtpNotice(otpRes.message || `Verification code sent to ${email.trim()}`);
      setStep('otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Student: Step 2 — verify OTP ──────────────────────────────
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Please choose a password with at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp(email.trim(), otpCode.trim(), fullName.trim(), newPassword.trim());
      await loginWithVerifiedData(res);
      router.replace('/(student)/assist');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Staff: email + password login ─────────────────────────────
  const handleStaffLogin = async () => {
    if (!staffEmail.trim() || !staffPassword) {
      setErrorMessage('Please enter your email and password.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await api.staffLogin(staffEmail.trim(), staffPassword);
      await loginWithVerifiedData(res);
      redirectByRole(res.role);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: LoginTab) => {
    setActiveTab(tab);
    setErrorMessage(null);
    setStep('email');
    setStudentMode('password');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Branding */}
        <View style={styles.brandContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="school" size={40} color="#ffffff" />
          </View>
          <Text style={styles.appName}>CampusFix</Text>
          <Text style={styles.tagline}>Autonomous Campus Problem Solving & Student Community</Text>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'student' && styles.tabActive]}
            onPress={() => switchTab('student')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="school-outline"
              size={15}
              color={activeTab === 'student' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'student' && styles.tabTextActive]}>
              Student Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'staff' && styles.tabActive]}
            onPress={() => switchTab('staff')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="briefcase-outline"
              size={15}
              color={activeTab === 'staff' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'staff' && styles.tabTextActive]}>
              Staff & Admin
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={Colors.error} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* ── STUDENT TAB ── */}
          {activeTab === 'student' && (
            <>
              {/* Sub-mode toggle: Password vs OTP */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeBtn, studentMode === 'password' && styles.modeBtnActive]}
                  onPress={() => { setStudentMode('password'); setErrorMessage(null); }}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={13}
                    color={studentMode === 'password' ? Colors.primary : Colors.textMuted}
                  />
                  <Text style={[styles.modeBtnText, studentMode === 'password' && styles.modeBtnTextActive]}>
                    Password
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, studentMode === 'otp' && styles.modeBtnActive]}
                  onPress={() => { setStudentMode('otp'); setErrorMessage(null); setStep('email'); }}
                >
                  <Ionicons
                    name="mail-outline"
                    size={13}
                    color={studentMode === 'otp' ? Colors.primary : Colors.textMuted}
                  />
                  <Text style={[styles.modeBtnText, studentMode === 'otp' && styles.modeBtnTextActive]}>
                    Email OTP
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Password login ── */}
              {studentMode === 'password' && (
                <>
                  <Text style={styles.cardTitle}>Student Sign In</Text>
                  <Text style={styles.cardSubtitle}>
                    Sign in with your college email and password.
                  </Text>

                  <Text style={styles.label}>College Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. kunal123@bpitindia.in"
                    placeholderTextColor={Colors.textLight}
                    value={stuEmail}
                    onChangeText={setStuEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="••••••••"
                      placeholderTextColor={Colors.textLight}
                      value={stuPassword}
                      onChangeText={setStuPassword}
                      secureTextEntry={!showStuPass}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowStuPass((p) => !p)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={showStuPass ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleStudentPasswordLogin}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="log-in-outline" size={18} color="#ffffff" />
                        <Text style={styles.buttonText}>Sign In</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.switchModeHint}
                    onPress={() => { setStudentMode('otp'); setErrorMessage(null); setStep('email'); }}
                  >
                    <Text style={styles.switchModeHintText}>
                      First time? Verify via Email OTP →
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ── OTP flow ── */}
              {studentMode === 'otp' && (
                <>
                  {step === 'email' ? (
                    <>
                      <Text style={styles.cardTitle}>Verify College Email</Text>
                      <Text style={styles.cardSubtitle}>
                        First time? Enter your official college email. We'll send a verification code.
                      </Text>

                      <Text style={styles.label}>College Email</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. kunal123@bpitindia.in"
                        placeholderTextColor={Colors.textLight}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <Text style={styles.label}>Your Name (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Kunal Sharma"
                        placeholderTextColor={Colors.textLight}
                        value={fullName}
                        onChangeText={setFullName}
                      />

                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleCheckEmailAndSendOtp}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <>
                            <Text style={styles.buttonText}>Send Verification Code</Text>
                            <Ionicons name="send-outline" size={18} color="#ffffff" />
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={styles.cardTitle}>Enter Verification Code</Text>
                      <Text style={styles.cardSubtitle}>
                        {otpNotice || `A 6-digit code was sent to ${email}`}
                      </Text>

                      {collegeInfo && (
                        <View style={styles.collegeBadge}>
                          <Ionicons name="business" size={16} color={Colors.primary} />
                          <Text style={styles.collegeName}>{collegeInfo.name}</Text>
                        </View>
                      )}

                      <Text style={styles.label}>6-Digit Verification Code *</Text>
                      <TextInput
                        style={[styles.input, styles.otpInput]}
                        placeholder="123456"
                        placeholderTextColor={Colors.textLight}
                        value={otpCode}
                        onChangeText={setOtpCode}
                        keyboardType="number-pad"
                        maxLength={6}
                      />

                      <Text style={styles.label}>Create Password (For future logins) *</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.input, styles.passwordInput]}
                          placeholder="At least 6 characters"
                          placeholderTextColor={Colors.textLight}
                          value={newPassword}
                          onChangeText={setNewPassword}
                          secureTextEntry={!showNewPass}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => setShowNewPass((p) => !p)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons
                            name={showNewPass ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color={Colors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.label}>Confirm Password *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Re-enter password"
                        placeholderTextColor={Colors.textLight}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showNewPass}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleVerifyOtp}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.buttonText}>Verify &amp; Create Profile</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => { setStep('email'); setErrorMessage(null); }}
                        disabled={loading}
                      >
                        <Ionicons name="arrow-back" size={16} color={Colors.textMuted} />
                        <Text style={styles.backButtonText}>Use a different email</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── STAFF / ADMIN TAB ── */}
          {activeTab === 'staff' && (
            <>
              <Text style={styles.cardTitle}>Staff & Admin Sign In</Text>
              <Text style={styles.cardSubtitle}>
                For Department Reps, College Admins, and Super Admins only.
              </Text>

              <Text style={styles.label}>Work Email</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. admin@bpitindia.in"
                placeholderTextColor={Colors.textLight}
                value={staffEmail}
                onChangeText={setStaffEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textLight}
                  value={staffPassword}
                  onChangeText={setStaffPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((p) => !p)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleStaffLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={18} color="#ffffff" />
                    <Text style={styles.buttonText}>Sign In</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    marginBottom: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
  },
  tagline: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 290,
  },
  // ── Tabs ──
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: Colors.card,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  // ── Mode Toggle (Password / OTP) ──
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 6,
  },
  modeBtnActive: {
    backgroundColor: '#ffffff',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  modeBtnTextActive: {
    color: Colors.primary,
  },
  // ── Card ──
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.errorLight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  collegeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  collegeName: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  otpInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 13,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 16,
    paddingVertical: 6,
  },
  backButtonText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  switchModeHint: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  switchModeHintText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});
