import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Header } from '../../components/Header';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { Department, Teacher } from '../../../shared/types';
import { Ionicons } from '@expo/vector-icons';

const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

export default function AdminManagementScreen() {
  const [activeTab, setActiveTab] = useState<'depts' | 'reps' | 'teachers'>('depts');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [reps, setReps] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form States
  const [showAddDept, setShowAddDept] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');

  const [showAddRep, setShowAddRep] = useState(false);
  const [repName, setRepName] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repPassword, setRepPassword] = useState('Rep@CampusFix123');
  const [repDeptId, setRepDeptId] = useState('');

  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [teacherName, setTeacherName] = useState('');
  const [teacherAliases, setTeacherAliases] = useState('');

  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [dList, rList, tList] = await Promise.all([
        api.getDepartments(),
        api.getRepresentatives(),
        api.getTeachers(),
      ]);
      setDepartments(dList);
      setReps(rList);
      setTeachers(tList);
      if (dList.length > 0 && !repDeptId) {
        setRepDeptId(dList[0].id);
      }
    } catch (e) {
      console.warn('Failed to load management data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDept = async () => {
    if (!deptName.trim() || !deptDesc.trim()) {
      showAlert('Required', 'Please fill in department name and description.');
      return;
    }
    setSaving(true);
    try {
      await api.createDepartment(deptName.trim(), deptDesc.trim());
      setDeptName('');
      setDeptDesc('');
      setShowAddDept(false);
      await loadData();
      showAlert('Success', 'Department created successfully.');
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to create department');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDept = (deptId: string, name: string) => {
    const doDelete = async () => {
      try {
        await api.deleteDepartment(deptId);
        await loadData();
        showAlert('Deleted', `Department "${name}" removed.`);
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to delete department.');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete department "${name}"?`)) doDelete();
    } else {
      Alert.alert('Confirm Delete', `Delete department "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleCreateRep = async () => {
    if (!repName.trim() || !repEmail.trim() || !repDeptId) {
      showAlert('Required', 'Please fill in representative name, email, and department.');
      return;
    }
    setSaving(true);
    try {
      await api.createRepresentative({
        full_name: repName.trim(),
        email: repEmail.trim(),
        department_id: repDeptId,
        password: repPassword || 'Rep@CampusFix123',
      });
      setRepName('');
      setRepEmail('');
      setShowAddRep(false);
      await loadData();
      showAlert('Success', 'Department representative provisioned successfully.');
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to create representative');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRep = (repId: string, name: string) => {
    const doDelete = async () => {
      try {
        await api.deleteRepresentative(repId);
        await loadData();
        showAlert('Deleted', `Representative "${name}" removed.`);
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to delete representative.');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove representative "${name}"?`)) doDelete();
    } else {
      Alert.alert('Confirm Delete', `Remove representative "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleCreateTeacher = async () => {
    if (!teacherName.trim()) {
      showAlert('Required', 'Please fill in teacher name.');
      return;
    }
    setSaving(true);
    try {
      const aliases = teacherAliases.split(',').map((a) => a.trim()).filter((a) => a);
      await api.createTeacher(teacherName.trim(), aliases);
      setTeacherName('');
      setTeacherAliases('');
      setShowAddTeacher(false);
      await loadData();
      showAlert('Success', 'Faculty member added successfully.');
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to create teacher');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeacher = (teacherId: string, name: string) => {
    const doDelete = async () => {
      try {
        await api.deleteTeacher(teacherId);
        await loadData();
        showAlert('Deleted', `Faculty "${name}" removed.`);
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to delete teacher.');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove faculty "${name}"?`)) doDelete();
    } else {
      Alert.alert('Confirm Delete', `Remove faculty "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Campus Setup" subtitle="Departments, Representatives & Faculty" />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'depts' && styles.tabActive]}
          onPress={() => setActiveTab('depts')}
        >
          <Text style={[styles.tabText, activeTab === 'depts' && styles.tabTextActive]}>
            Departments ({departments.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'reps' && styles.tabActive]}
          onPress={() => setActiveTab('reps')}
        >
          <Text style={[styles.tabText, activeTab === 'reps' && styles.tabTextActive]}>
            Representatives ({reps.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'teachers' && styles.tabActive]}
          onPress={() => setActiveTab('teachers')}
        >
          <Text style={[styles.tabText, activeTab === 'teachers' && styles.tabTextActive]}>
            Faculty ({teachers.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* DEPARTMENTS TAB */}
        {activeTab === 'depts' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>College Departments</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddDept(!showAddDept)}>
                <Ionicons name={showAddDept ? 'close' : 'add'} size={18} color="#ffffff" />
                <Text style={styles.addBtnText}>{showAddDept ? 'Cancel' : 'Add Department'}</Text>
              </TouchableOpacity>
            </View>

            {showAddDept && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>New Department</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Department Name (e.g. Hostels & Mess)"
                  placeholderTextColor={Colors.textLight}
                  value={deptName}
                  onChangeText={setDeptName}
                />
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  placeholder="Description of responsibilities"
                  placeholderTextColor={Colors.textLight}
                  value={deptDesc}
                  onChangeText={setDeptDesc}
                  multiline
                />
                <TouchableOpacity style={styles.saveBtn} onPress={handleCreateDept} disabled={saving}>
                  {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>Save Department</Text>}
                </TouchableOpacity>
              </View>
            )}

            {departments.map((d) => (
              <View key={d.id} style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{d.name}</Text>
                  <Text style={styles.itemSubtitle}>{d.description}</Text>
                </View>
                <TouchableOpacity
                  style={styles.trashBtn}
                  onPress={() => handleDeleteDept(d.id, d.name)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={19} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {departments.length === 0 && !showAddDept && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No departments created yet. Click "+ Add Department".</Text>
              </View>
            )}
          </View>
        )}

        {/* REPRESENTATIVES TAB */}
        {activeTab === 'reps' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Department Representatives</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddRep(!showAddRep)}>
                <Ionicons name={showAddRep ? 'close' : 'add'} size={18} color="#ffffff" />
                <Text style={styles.addBtnText}>{showAddRep ? 'Cancel' : 'Add Representative'}</Text>
              </TouchableOpacity>
            </View>

            {showAddRep && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>New Representative</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name (e.g. Rohan Sharma)"
                  placeholderTextColor={Colors.textLight}
                  value={repName}
                  onChangeText={setRepName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="College Email (e.g. rohan.rep@bpitindia.in)"
                  placeholderTextColor={Colors.textLight}
                  value={repEmail}
                  onChangeText={setRepEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password (Default: Rep@CampusFix123)"
                  placeholderTextColor={Colors.textLight}
                  value={repPassword}
                  onChangeText={setRepPassword}
                  autoCapitalize="none"
                />
                <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 4 }}>Assign Department:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {departments.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.deptPill, repDeptId === d.id && styles.deptPillActive]}
                      onPress={() => setRepDeptId(d.id)}
                    >
                      <Text style={[styles.deptPillText, repDeptId === d.id && { color: '#ffffff' }]}>
                        {d.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.saveBtn} onPress={handleCreateRep} disabled={saving}>
                  {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>Save Representative</Text>}
                </TouchableOpacity>
              </View>
            )}

            {reps.map((r) => {
              const dept = departments.find((d) => d.id === r.department_id);
              return (
                <View key={r.id} style={styles.itemCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{r.full_name}</Text>
                    <Text style={styles.itemSubtitle}>{r.email}</Text>
                    <View style={styles.pillBadge}>
                      <Text style={styles.pillBadgeText}>{dept?.name || r.department_id || 'General'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => handleDeleteRep(r.id, r.full_name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={19} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              );
            })}

            {reps.length === 0 && !showAddRep && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No representatives created yet. Click "+ Add Representative".</Text>
              </View>
            )}
          </View>
        )}

        {/* TEACHERS TAB */}
        {activeTab === 'teachers' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Faculty & Entities</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddTeacher(!showAddTeacher)}>
                <Ionicons name={showAddTeacher ? 'close' : 'add'} size={18} color="#ffffff" />
                <Text style={styles.addBtnText}>{showAddTeacher ? 'Cancel' : 'Add Faculty'}</Text>
              </TouchableOpacity>
            </View>

            {showAddTeacher && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>New Faculty / Teacher</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Official Name (e.g. Dr. A. K. Verma)"
                  placeholderTextColor={Colors.textLight}
                  value={teacherName}
                  onChangeText={setTeacherName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Aliases (comma-separated, e.g. Verma Sir, HOD CSE)"
                  placeholderTextColor={Colors.textLight}
                  value={teacherAliases}
                  onChangeText={setTeacherAliases}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={handleCreateTeacher} disabled={saving}>
                  {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>Save Faculty</Text>}
                </TouchableOpacity>
              </View>
            )}

            {teachers.map((t) => (
              <View key={t.id} style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{t.name}</Text>
                  <Text style={styles.itemSubtitle}>
                    Aliases: {t.aliases?.join(', ') || 'None registered'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.trashBtn}
                  onPress={() => handleDeleteTeacher(t.id, t.name)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={19} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {teachers.length === 0 && !showAddTeacher && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No faculty members registered yet. Click "+ Add Faculty".</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    elevation: 2,
  },
  formTitle: {
    fontSize: 15,
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
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  deptPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#f8fafc',
  },
  deptPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  deptPillText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  trashBtn: {
    padding: 4,
    marginLeft: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  itemSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pillBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
