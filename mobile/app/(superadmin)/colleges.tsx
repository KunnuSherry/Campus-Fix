import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Modal,
} from 'react-native';
import { Header } from '../../components/Header';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type SuperAdminTab = 'colleges' | 'admins';

const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

export default function SuperAdminCollegesScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SuperAdminTab>('colleges');
  const [colleges, setColleges] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'superadmin') {
        router.replace('/(auth)/login');
      } else {
        fetchData();
      }
    }
  }, [user, authLoading]);

  // Create College State
  const [showCreateCollege, setShowCreateCollege] = useState(false);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('Admin@CampusFix123');
  const [savingCollege, setSavingCollege] = useState(false);

  // Create Admin State
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminCollegeId, setNewAdminCollegeId] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('Admin@CampusFix123');
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Edit College Modal State
  const [editingCollege, setEditingCollege] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editAdminName, setEditAdminName] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editAdminPassword, setEditAdminPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditCollege = (college: any) => {
    setEditingCollege(college);
    setEditName(college.name || '');
    setEditDomain(college.domains?.[0] || '');
    // Look up associated admin from admins list
    const colAdmin = admins.find((a) => a.college_id === college.id);
    if (colAdmin) {
      setEditAdminName(colAdmin.full_name || '');
      setEditAdminEmail(colAdmin.email || '');
    } else {
      setEditAdminName('');
      setEditAdminEmail('');
    }
    setEditAdminPassword('');
  };

  const handleSaveEditCollege = async () => {
    if (!editingCollege) return;
    if (!editName.trim() || !editDomain.trim()) {
      showAlert('Required', 'Please fill in college name and official domain.');
      return;
    }

    setSavingEdit(true);
    try {
      await api.updateCollege(editingCollege.id, {
        name: editName.trim(),
        domain: editDomain.trim(),
        admin_name: editAdminName.trim() || undefined,
        admin_email: editAdminEmail.trim() || undefined,
        admin_password: editAdminPassword.trim() || undefined,
      });
      setEditingCollege(null);
      await fetchData();
      showAlert('Updated', `College "${editName}" and administrator details updated successfully.`);
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to update college.');
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchData = async () => {
    try {
      const [colList, admList] = await Promise.all([
        api.getColleges().catch(() => []),
        api.getAdmins().catch(() => []),
      ]);
      setColleges(colList);
      setAdmins(admList);
      if (colList.length > 0 && !newAdminCollegeId) {
        setNewAdminCollegeId(colList[0].id);
      }
    } catch (e) {
      console.warn('Failed to load superadmin data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateCollege = async () => {
    if (!name.trim() || !domain.trim() || !adminEmail.trim()) {
      showAlert('Required', 'Please fill in college name, official domain, and admin email.');
      return;
    }

    setSavingCollege(true);
    try {
      await api.createCollege({
        name: name.trim(),
        domain: domain.trim(),
        admin_email: adminEmail.trim(),
        admin_name: adminName.trim() || 'College Admin',
        admin_password: adminPassword || 'Admin@CampusFix123',
      });
      setName('');
      setDomain('');
      setAdminEmail('');
      setAdminName('');
      setShowCreateCollege(false);
      await fetchData();
      showAlert('Success', `College "${name}" and its administrator account provisioned.`);
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to create college.');
    } finally {
      setSavingCollege(false);
    }
  };

  const handleDeleteCollege = (collegeId: string, collegeName: string) => {
    const doDelete = async () => {
      try {
        await api.deleteCollege(collegeId);
        await fetchData();
        showAlert('Deleted', `College "${collegeName}" and associated data removed.`);
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to delete college.');
      }
    };

    // Works on web & native
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Are you sure you want to delete college "${collegeName}"? This will delete all its departments, reps, and reports.`)) {
        doDelete();
      }
    } else {
      Alert.alert('Confirm Delete', `Delete college "${collegeName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdminEmail.trim() || !newAdminName.trim() || !newAdminCollegeId) {
      showAlert('Required', 'Please fill in email, full name, and select a college.');
      return;
    }

    setSavingAdmin(true);
    try {
      await api.createAdmin({
        email: newAdminEmail.trim(),
        full_name: newAdminName.trim(),
        college_id: newAdminCollegeId,
        password: newAdminPassword || 'Admin@CampusFix123',
      });
      setNewAdminEmail('');
      setNewAdminName('');
      setShowCreateAdmin(false);
      await fetchData();
      showAlert('Success', 'College Administrator created successfully.');
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to create admin.');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleDeleteAdmin = (adminId: string, email: string) => {
    const doDelete = async () => {
      try {
        await api.deleteAdmin(adminId);
        await fetchData();
        showAlert('Deleted', `Admin ${email} removed.`);
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to delete admin.');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete admin account for ${email}?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Confirm Delete', `Delete admin ${email}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const renderCollege = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.collegeName}>{item.name}</Text>
          <Text style={styles.idText}>ID: {item.id}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={styles.trashBtn}
            onPress={() => openEditCollege(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={19} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.trashBtn}
            onPress={() => handleDeleteCollege(item.id, item.name)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={19} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.domainRow}>
        <Ionicons name="at-circle-outline" size={16} color={Colors.primary} />
        <Text style={styles.domainLabel}>Allowed Domains:</Text>
        <Text style={styles.domainValue}>{item.domains?.join(', ') || 'None'}</Text>
      </View>
    </View>
  );

  const renderAdmin = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.collegeName}>{item.full_name}</Text>
          <Text style={styles.idText}>{item.email}</Text>
        </View>
        <TouchableOpacity
          style={styles.trashBtn}
          onPress={() => handleDeleteAdmin(item.id, item.email)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={19} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.domainRow}>
        <Ionicons name="business-outline" size={16} color={Colors.accent} />
        <Text style={styles.domainLabel}>College:</Text>
        <Text style={styles.domainValue}>{item.college_name || item.college_id}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header title="Super Admin" subtitle="Multi-College Tenant Management" />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'colleges' && styles.tabActive]}
          onPress={() => setActiveTab('colleges')}
        >
          <Ionicons
            name="school-outline"
            size={16}
            color={activeTab === 'colleges' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'colleges' && styles.tabTextActive]}>
            Colleges ({colleges.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'admins' && styles.tabActive]}
          onPress={() => setActiveTab('admins')}
        >
          <Ionicons
            name="people-outline"
            size={16}
            color={activeTab === 'admins' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'admins' && styles.tabTextActive]}>
            College Admins ({admins.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Bar */}
      <View style={styles.topBar}>
        <Text style={styles.countText}>
          {activeTab === 'colleges' ? `Tenants (${colleges.length})` : `Admins (${admins.length})`}
        </Text>
        {activeTab === 'colleges' ? (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateCollege(!showCreateCollege)}
          >
            <Ionicons name={showCreateCollege ? 'close' : 'add'} size={18} color="#ffffff" />
            <Text style={styles.createBtnText}>
              {showCreateCollege ? 'Cancel' : 'New College'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateAdmin(!showCreateAdmin)}
          >
            <Ionicons name={showCreateAdmin ? 'close' : 'add'} size={18} color="#ffffff" />
            <Text style={styles.createBtnText}>
              {showCreateAdmin ? 'Cancel' : 'New Admin'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Create College Form */}
      {activeTab === 'colleges' && showCreateCollege && (
        <ScrollView style={styles.formCard} keyboardShouldPersistTaps="handled">
          <Text style={styles.formTitle}>Provision New College Tenant</Text>
          <TextInput
            style={styles.input}
            placeholder="College Name (e.g. Bhagwan Parshuram Institute of Technology)"
            placeholderTextColor={Colors.textLight}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Official Allowed Domain (e.g. bpitindia.in)"
            placeholderTextColor={Colors.textLight}
            value={domain}
            onChangeText={setDomain}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Admin Name (e.g. Campus Admin)"
            placeholderTextColor={Colors.textLight}
            value={adminName}
            onChangeText={setAdminName}
          />
          <TextInput
            style={styles.input}
            placeholder="Admin Email (e.g. admin@bpitindia.in)"
            placeholderTextColor={Colors.textLight}
            value={adminEmail}
            onChangeText={setAdminEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Admin Password (Default: Admin@CampusFix123)"
            placeholderTextColor={Colors.textLight}
            value={adminPassword}
            onChangeText={setAdminPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleCreateCollege}
            disabled={savingCollege}
          >
            {savingCollege ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>Create College Environment</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Create Admin Form */}
      {activeTab === 'admins' && showCreateAdmin && (
        <ScrollView style={styles.formCard} keyboardShouldPersistTaps="handled">
          <Text style={styles.formTitle}>Add College Administrator</Text>
          <TextInput
            style={styles.input}
            placeholder="Admin Full Name"
            placeholderTextColor={Colors.textLight}
            value={newAdminName}
            onChangeText={setNewAdminName}
          />
          <TextInput
            style={styles.input}
            placeholder="Work Email (e.g. admin2@bpitindia.in)"
            placeholderTextColor={Colors.textLight}
            value={newAdminEmail}
            onChangeText={setNewAdminEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password (Default: Admin@CampusFix123)"
            placeholderTextColor={Colors.textLight}
            value={newAdminPassword}
            onChangeText={setNewAdminPassword}
            autoCapitalize="none"
          />
          <Text style={styles.pickerLabel}>Assign To College:</Text>
          <View style={styles.collegeSelector}>
            {colleges.map((col) => (
              <TouchableOpacity
                key={col.id}
                style={[
                  styles.collegeChip,
                  newAdminCollegeId === col.id && styles.collegeChipActive,
                ]}
                onPress={() => setNewAdminCollegeId(col.id)}
              >
                <Text
                  style={[
                    styles.collegeChipText,
                    newAdminCollegeId === col.id && styles.collegeChipTextActive,
                  ]}
                >
                  {col.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleCreateAdmin}
            disabled={savingAdmin}
          >
            {savingAdmin ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>Create Admin Account</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Main List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === 'colleges' ? (
        <FlatList
          data={colleges}
          keyExtractor={(item) => item.id}
          renderItem={renderCollege}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="school-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Colleges Registered Yet</Text>
              <Text style={styles.emptySubtitle}>
                Click "+ New College" above to create your first college tenant.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              colors={[Colors.primary]}
            />
          }
        />
      ) : (
        <FlatList
          data={admins}
          keyExtractor={(item) => item.id}
          renderItem={renderAdmin}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No College Admins Found</Text>
              <Text style={styles.emptySubtitle}>
                Provision a college first to automatically create its administrator.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              colors={[Colors.primary]}
            />
          }
        />
      )}

      {/* Edit College Modal */}
      <Modal
        visible={!!editingCollege}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCollege(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit College Details</Text>
                <Text style={styles.modalSubtitle}>Update tenant configuration &amp; admin credentials</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingCollege(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>College Name *</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="College Name"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Official Allowed Domain *</Text>
              <TextInput
                style={styles.input}
                value={editDomain}
                onChangeText={setEditDomain}
                placeholder="e.g. bpitindia.in"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Administrator Full Name</Text>
              <TextInput
                style={styles.input}
                value={editAdminName}
                onChangeText={setEditAdminName}
                placeholder="Admin Full Name"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Administrator Email</Text>
              <TextInput
                style={styles.input}
                value={editAdminEmail}
                onChangeText={setEditAdminEmail}
                placeholder="admin@college.edu.in"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Reset Administrator Password</Text>
              <TextInput
                style={styles.input}
                value={editAdminPassword}
                onChangeText={setEditAdminPassword}
                placeholder="Leave blank to keep existing password"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setEditingCollege(null)}
                  disabled={savingEdit}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveEditCollege}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  createBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  formCard: {
    margin: 16,
    maxHeight: 400,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 3,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 10,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 6,
  },
  collegeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  collegeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#f8fafc',
  },
  collegeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eff6ff',
  },
  collegeChipText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  collegeChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: Colors.success,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  collegeName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  trashBtn: {
    padding: 4,
  },
  idText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  domainLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  domainValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    marginTop: 6,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
