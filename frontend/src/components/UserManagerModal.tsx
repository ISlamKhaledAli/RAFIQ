import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Key,
  Lock,
  Search,
  Check,
  X,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  CheckSquare,
  Square,
  Edit3,
  Trash2,
  UserCheck,
  UserX,
  Settings,
  ShoppingCart,
  FileText,
  Package,
  Truck,
  CreditCard,
  BarChart2,
  DollarSign,
  Smartphone,
  Wallet,
  Clock,
  ClipboardList,
  Pill,
  Building2,
  HeartPulse,
  Coffee,
} from 'lucide-react';
import { invoke, deleteUser } from '../bridge/ipc';
import type { UserDto } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { useFeatures } from '../context/useFeatures';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmModal } from './ConfirmModal';
import { isValidPinFormat, isWeakPin } from '../utils/pinPolicy';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { RequiredMark } from './RequiredMark';
import { CASHIER_PERMISSION_GROUPS, OWNER_GRADE_GROUP } from '../constants/permissionGroups';
import type { PermissionGroupDef, PermissionIconId } from '../constants/permissionGroups';
import { buildOwnerGradePayload, getGrantedOwnerGradeKeys, OWNER_GRADE_CHIP_LABELS } from '../utils/ownerGrade';
import {
  canManageUser,
  getRoleBadgeClasses,
  getRoleKind,
  getRoleLabel,
  getTier,
  ROLE_LABEL_CASHIER,
  ROLE_LABEL_MANAGER,
} from '../utils/roleLabels';

const PERMISSION_ICONS: Record<PermissionIconId, React.ReactNode> = {
  cart: <ShoppingCart className="w-4 h-4 text-brand" />,
  pricing: <DollarSign className="w-4 h-4 text-brand" />,
  shifts: <Clock className="w-4 h-4 text-brand" />,
  invoices: <FileText className="w-4 h-4 text-brand" />,
  customers: <Users className="w-4 h-4 text-brand" />,
  products: <Package className="w-4 h-4 text-brand" />,
  stock: <ClipboardList className="w-4 h-4 text-brand" />,
  purchases: <Truck className="w-4 h-4 text-brand" />,
  expenses: <CreditCard className="w-4 h-4 text-brand" />,
  epay: <Smartphone className="w-4 h-4 text-brand" />,
  wallets: <Wallet className="w-4 h-4 text-brand" />,
  reports: <BarChart2 className="w-4 h-4 text-brand" />,
  settings: <Settings className="w-4 h-4 text-brand" />,
  users: <Shield className="w-4 h-4 text-brand" />,
  pharma: <Pill className="w-4 h-4 text-brand" />,
  insurance: <Building2 className="w-4 h-4 text-brand" />,
  patients: <HeartPulse className="w-4 h-4 text-brand" />,
  cafe: <Coffee className="w-4 h-4 text-brand" />,
  ownerGrade: <ShieldCheck className="w-4 h-4 text-brand" />,
};

type PermissionGroup = PermissionGroupDef;

/** Tree order: root/owner first, managers before cashiers, then by display name. */
function sortTreeNodes(nodes: UserDto[]): UserDto[] {
  return [...nodes]
    .sort((a, b) => getTier(b) - getTier(a) || a.displayName.localeCompare(b.displayName, 'ar'))
    .map((n) => (n.children && n.children.length > 0 ? { ...n, children: sortTreeNodes(n.children) } : n));
}

interface UserManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsersChanged?: () => void;
  currentUser?: UserDto | null;
}

// Builds the hierarchy locally from the flat list: owner on top, managers directly beneath the owner,
// cashiers beneath their creator (or the owner when the creator is not visible).
function buildTreeFromFlat(flatList: UserDto[]): UserDto[] {
  const map = new Map<string, UserDto>();
  const roots: UserDto[] = [];
  const owner = flatList.find((u) => getRoleKind(u) === 'owner');

  flatList.forEach((u) => {
    map.set(u.id, { ...u, children: [] });
  });

  const wouldCycle = (childId: string, candidateParentId: string): boolean => {
    let cursor: string | null | undefined = candidateParentId;
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === childId) return true;
      cursor = map.get(cursor)?.parentId;
    }
    return false;
  };

  flatList.forEach((u) => {
    const node = map.get(u.id);
    if (!node) return;
    const kind = getRoleKind(u);
    let parentNode: UserDto | undefined;
    if (kind === 'manager') {
      parentNode = owner ? map.get(owner.id) : undefined;
    } else if (kind === 'cashier') {
      parentNode = (u.parentId ? map.get(u.parentId) : undefined) || (owner ? map.get(owner.id) : undefined);
    }
    if (parentNode && parentNode.id !== u.id && !wouldCycle(u.id, parentNode.id)) {
      parentNode.children = parentNode.children || [];
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return sortTreeNodes(roots);
}

export const UserManagerModal: React.FC<UserManagerModalProps> = ({
  isOpen,
  onClose,
  onUsersChanged,
  currentUser: propCurrentUser,
}) => {
  const { currentUser: authUser, isRoot } = useAuth();
  const currentUser = propCurrentUser || authUser;
  const isRootSession = isRoot || currentUser?.role === 'root' || currentUser?.username === 'root';
  const viewerTier = getTier(currentUser);
  const canChooseManagerRole = viewerTier >= 2;
  const isSameAccount = useCallback(
    (u: UserDto | null | undefined): boolean => Boolean(u) && currentUser?.id === u?.id,
    [currentUser]
  );
  const [users, setUsers] = useState<UserDto[]>([]);
  const [userTree, setUserTree] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserDto | null>(null);

  // Form modes: 'none' | 'add' | 'edit' | 'permissions' | 'ownerGrade' | 'credentials'
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit' | 'permissions' | 'ownerGrade' | 'credentials'>('none');
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);

  const { isEnabled } = useFeatures();

  // Filter permission groups based on active store features (zero pharmacy/cafe leakage in other stores)
  const visiblePermissionGroups = useMemo(() => {
    return CASHIER_PERMISSION_GROUPS.filter((group) => !group.feature || isEnabled(group.feature));
  }, [isEnabled]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Form Fields
  const [parentId, setParentId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentCredential, setCurrentCredential] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [permissionsState, setPermissionsState] = useState<Record<string, boolean>>({});
  const [ownerGradeState, setOwnerGradeState] = useState<Record<string, boolean>>({});

  // Tree expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});


  // Load Data (also the single refresh path after create / edit / role change / delete)
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const allList = await invoke<UserDto[]>('users:getAll');
      const visibleUsers = (allList || []).filter((u) => isRootSession || u.role !== 'root');
      setUsers(visibleUsers);
      setUserTree(buildTreeFromFlat(visibleUsers));
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات المستخدمين والهيكل الإداري.');
    } finally {
      setLoading(false);
    }
  }, [isRootSession]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setFormMode('none');
      setSelectedUser(null);
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen, loadData]);

  // Toggle tree node expansion
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Find user by id in all users
  const findUserById = useCallback((id: string): UserDto | undefined => {
    return users.find((u) => u.id === id);
  }, [users]);

  // Owner / manager / root accounts hold every operational permission by default (cashiers are matrix-limited)
  const isPrivilegedAccount = useCallback((u: UserDto | null | undefined): boolean => getTier(u) >= 1, []);

  // Parent user for permission capping (the creator; the server decides the real parent)
  const activeParentUser = useMemo(() => {
    if (!parentId) {
      return currentUser || users.find((u) => getTier(u) >= 1) || null;
    }
    return findUserById(parentId) || currentUser || null;
  }, [parentId, currentUser, users, findUserById]);

  // Check if active parent holds a permission
  const parentHoldsPermission = useCallback(
    (permKey: string): boolean => {
      // 1. If currently logged in as Root, root holds all permissions unconditionally
      if (isRootSession) return true;

      // 2. If active parent is Root, root holds everything
      if (activeParentUser && (activeParentUser.role === 'root' || activeParentUser.username === 'root')) {
        return true;
      }

      // 3. Owner / manager: holds all operational permissions unless explicitly revoked by Root
      if (!activeParentUser || isPrivilegedAccount(activeParentUser)) {
        if (activeParentUser?.permissions && activeParentUser.permissions[permKey] === false) {
          return false;
        }
        return true;
      }

      // 4. Any other account: restricted to its assigned permissions
      if (!activeParentUser.permissions) return false;
      return !!activeParentUser.permissions[permKey];
    },
    [isRootSession, activeParentUser, isPrivilegedAccount]
  );

  // Start Add Account (single entry point; the server decides the parent account)
  const handleStartAdd = () => {
    setParentId(currentUser?.id || '');
    setUsername('');
    setDisplayName('');
    setRole('cashier');
    setPin('');
    setConfirmPin('');
    setIsActive(true);

    // Default permissions based on cashier role
    const initialPerms: Record<string, boolean> = {};
    CASHIER_PERMISSION_GROUPS.forEach((g) => {
      g.items.forEach((p) => {
        initialPerms[p.key] = false;
      });
    });
    // Give basic cashier permissions by default (strictly limited to active selling)
    initialPerms['pos.access'] = true;
    initialPerms['pos.sell'] = true;
    initialPerms['epay.access'] = true;
    initialPerms['epay.transact'] = true;
    initialPerms['products.view'] = true;
    initialPerms['customers.view'] = true;

    setPermissionsState(initialPerms);
    setSelectedUser(null);
    setFormMode('add');
    setError('');
    setSuccessMsg('');
  };

  // Start Edit User Details
  const handleStartEdit = (user: UserDto) => {
    setSelectedUser(user);
    setParentId(user.parentId || '');
    setUsername(user.username);
    setDisplayName(user.displayName);
    setRole(user.role === 'admin' ? 'admin' : 'cashier');
    setIsActive(user.isActive);
    setFormMode('edit');
    setError('');
    setSuccessMsg('');
  };

  // Start Manage Permissions (cashier matrix; managers use the owner-grade panel instead)
  const handleStartPermissions = (user: UserDto) => {
    setSelectedUser(user);
    setParentId(user.parentId || '');

    // Fill current user permissions
    const perms: Record<string, boolean> = {};
    CASHIER_PERMISSION_GROUPS.forEach((g) => {
      g.items.forEach((p) => {
        perms[p.key] = !!user.permissions?.[p.key];
      });
    });
    setPermissionsState(perms);
    setFormMode('permissions');
    setError('');
    setSuccessMsg('');
  };

  // Start the owner-grade panel of a manager (the owner/root decide which owner privileges he holds)
  const handleStartOwnerGrade = (user: UserDto) => {
    const granted: Record<string, boolean> = {};
    OWNER_GRADE_GROUP.items.forEach((item) => {
      granted[item.key] = user.permissions?.[item.key] === true;
    });
    setSelectedUser(user);
    setOwnerGradeState(granted);
    setFormMode('ownerGrade');
    setError('');
    setSuccessMsg('');
  };

  // Start Credentials Manager
  const handleStartCredentials = (user: UserDto) => {
    setSelectedUser(user);
    setPin('');
    setConfirmPin('');
    setCurrentCredential('');
    setFormMode('credentials');
    setError('');
    setSuccessMsg('');
  };

  // Save the owner-grade grants: the server stores only the keys that are true and audits every change
  const handleSubmitOwnerGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || getTier(selectedUser) !== 1 || viewerTier < 2) return;

    setLoading(true);
    setError('');
    try {
      await invoke('users:updatePermissions', {
        userId: selectedUser.id,
        permissions: buildOwnerGradePayload(ownerGradeState),
      });
      setSuccessMsg(`تم تحديث الصلاحيات الخاصة بالمالك للمدير (${selectedUser.displayName}).`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل حفظ الصلاحيات الخاصة بالمالك.');
    } finally {
      setLoading(false);
    }
  };

  // Submit New Sub-User
  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) {
      setError('يرجى كتابة اسم المستخدم واسم الموظف الكامل.');
      return;
    }

    if (!pin) {
      setError('يجب تحديد رقم سري (PIN) للدخول.');
      return;
    }

    if (!isValidPinFormat(pin)) {
      setError('الرقم السري (PIN) يجب أن يتكون من 4 إلى 8 أرقام رقمية.');
      return;
    }
    if (isWeakPin(pin)) {
      setError('الرقم السري ضعيف وسهل التخمين. يرجى اختيار رقم سري أقوى (غير مكرر أو متتالي).');
      return;
    }
    if (pin !== confirmPin) {
      setError('الرقم السري وتأكيد الرقم السري غير متطابقين.');
      return;
    }

    // Only a manager-or-lower account may be created by this session; managers always create cashiers
    const effectiveRole: 'admin' | 'cashier' = canChooseManagerRole ? role : 'cashier';

    // Verify the permission ceiling (managers hold all operational permissions, so their matrix is not sent)
    // Every key is sent explicitly (true/false) so role defaults never re-grant an unchecked key
    const finalPermissions: Record<string, boolean> = {};
    if (effectiveRole === 'cashier') {
      Object.keys(permissionsState).forEach((k) => {
        // A key the parent doesn't hold can never be granted
        finalPermissions[k] = Boolean(permissionsState[k]) && parentHoldsPermission(k);
      });
    }

    setLoading(true);
    setError('');
    try {
      await invoke('users:createSubUser', {
        username: username.trim(),
        displayName: displayName.trim(),
        pin,
        role: effectiveRole,
        permissions: effectiveRole === 'cashier' ? finalPermissions : undefined,
      });

      setSuccessMsg(`تم إنشاء الحساب (${displayName})`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل إنشاء الحساب الجديد.');
    } finally {
      setLoading(false);
    }
  };

  // What the viewer may change on an account in the edit form (owner/root role and status are fixed)
  const getEditPrivileges = (u: UserDto) => {
    const self = isSameAccount(u);
    const manage = canManageUser(currentUser, u);
    const fixedAccount = getTier(u) >= 2;
    return {
      self,
      manage,
      canChangeRole: manage && canChooseManagerRole && !self && !fixedAccount,
      canChangeActive: manage && !self && !fixedAccount,
    };
  };

  // Submit Edit Details
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !displayName.trim()) {
      setError('اسم الموظف مطلوب.');
      return;
    }

    const { self: isSelfEdit, manage: canManage, canChangeRole, canChangeActive } = getEditPrivileges(selectedUser);
    if (!canManage && !isSelfEdit) {
      setError('ليس لديك صلاحية تعديل هذا الحساب.');
      return;
    }
    // Role / active status change only for accounts strictly below the viewer (never self, owner or root)
    const nextRole = canChangeRole ? role : selectedUser.role;
    const nextActive = canChangeActive ? isActive : selectedUser.isActive;

    setLoading(true);
    setError('');
    try {
      await invoke('users:update', {
        id: selectedUser.id,
        displayName: displayName.trim(),
        role: nextRole,
        isActive: nextActive,
      });

      setSuccessMsg('تم تحديث بيانات الحساب');
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تحديث بيانات الحساب.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Permissions
  const handleSubmitPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    // Build checked permissions dictionary
    const finalPerms: Record<string, boolean> = {};
    Object.keys(permissionsState).forEach((key) => {
      // If root session, root has all permissions, otherwise enforce parentHoldsPermission
      if (permissionsState[key] && (isRootSession || parentHoldsPermission(key))) {
        finalPerms[key] = true;
      } else {
        finalPerms[key] = false;
      }
    });
    // Keys hidden from the editor (owner/root-only or retired) keep their stored value
    Object.keys(selectedUser.permissions || {}).forEach((key) => {
      if (!(key in finalPerms)) finalPerms[key] = !!selectedUser.permissions![key];
    });

    setLoading(true);
    setError('');
    try {
      await invoke('users:updatePermissions', {
        userId: selectedUser.id,
        permissions: finalPerms,
      });

      setSuccessMsg(`تم تحديث صلاحيات الحساب (${selectedUser.displayName})`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل حفظ الصلاحيات.');
    } finally {
      setLoading(false);
    }
  };

  // Owner (non-root) resetting a manager's PIN confirms with his own PIN, sent as supervisorPin
  const credUsesSupervisorPin = (target: UserDto): boolean =>
    !isRootSession && !isSameAccount(target) && getTier(target) === 1 && canManageUser(currentUser, target);

  // Submit Credentials (PIN only; legacy passwords are left untouched on the server)
  const handleSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!pin) {
      setError('يرجى إدخال رقم سري (PIN) جديد.');
      return;
    }
    if (!isValidPinFormat(pin)) {
      setError('الرقم السري (PIN) يجب أن يكون من 4 إلى 8 أرقام.');
      return;
    }
    if (isWeakPin(pin)) {
      setError('الرقم السري ضعيف وسهل التخمين. يرجى اختيار رقم سري أقوى (غير مكرر أو متتالي).');
      return;
    }
    if (pin !== confirmPin) {
      setError('الرقم السري وتأكيد الرقم السري غير متطابقين.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Resetting a manager: the server wants the owner's own PIN as supervisorPin (never as the manager's currentPin)
      await invoke('users:changePin', {
        id: selectedUser.id,
        newPin: pin,
        currentPin: credUsesSupervisorPin(selectedUser) ? undefined : currentCredential || undefined,
        supervisorPin: credUsesSupervisorPin(selectedUser) ? currentCredential || undefined : undefined,
      });

      setSuccessMsg(`تم تحديث الرقم السري للحساب (${selectedUser.displayName})`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تحديث الرقم السري.');
    } finally {
      setLoading(false);
    }
  };

  // Soft-delete an account (server enforces who may delete whom and blocks accounts with an open shift)
  const handleConfirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setLoading(true);
    setError('');
    try {
      await deleteUser(target.id);
      setSuccessMsg(`تم حذف حساب (${target.displayName}) من القوائم.`);
      setFormMode('none');
      await loadData();
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل حذف الحساب.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle user active status directly
  const handleToggleStatus = async (user: UserDto) => {
    if (!canManageUser(currentUser, user) || isSameAccount(user)) {
      setError('ليس لديك صلاحية تعطيل أو تفعيل هذا الحساب.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await invoke('users:update', {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        isActive: !user.isActive,
      });
      setSuccessMsg(
        user.isActive
          ? `تم تعطيل حساب (${user.displayName})`
          : `تم تفعيل حساب (${user.displayName})`
      );
      await loadData();
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تغيير حالة الحساب.');
    } finally {
      setLoading(false);
    }
  };

  // Permission selection helpers
  const handleTogglePermission = (key: string) => {
    if (!parentHoldsPermission(key)) return;
    setPermissionsState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleToggleGroup = (group: PermissionGroup, enableAll: boolean) => {
    setPermissionsState((prev) => {
      const next = { ...prev };
      group.items.forEach((item) => {
        if (parentHoldsPermission(item.key)) {
          next[item.key] = enableAll;
        }
      });
      return next;
    });
  };

  const handleToggleAllPermissions = (enableAll: boolean) => {
    setPermissionsState((prev) => {
      const next = { ...prev };
      visiblePermissionGroups.forEach((g) => {
        g.items.forEach((item) => {
          if (parentHoldsPermission(item.key)) {
            next[item.key] = enableAll;
          }
        });
      });
      return next;
    });
  };

  // Filtered users for table view
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Render Role Badge (labels come from the shared role helper; only the owner is ever "المالك")
  const renderRoleBadge = (u: UserDto) => {
    const kind = getRoleKind(u);
    const Icon = kind === 'root' ? ShieldCheck : kind === 'cashier' ? Users : Shield;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${getRoleBadgeClasses(u)}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{getRoleLabel(u)}</span>
      </span>
    );
  };

  // Format readable Arabic date/time for last login
  const formatLastLogin = (dateStr?: string | null) => {
    if (!dateStr) return 'لم يسجل دخول بعد';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'لم يسجل دخول بعد';
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const timePart = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
      if (isToday) {
        return `اليوم ${timePart}`;
      }
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return `أمس ${timePart}`;
      }
      const datePart = d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
      return `${datePart} - ${timePart}`;
    } catch {
      return 'لم يسجل دخول بعد';
    }
  };

  // Render Recursive Tree Node
  const renderTreeNode = (node: UserDto, level = 0) => {
    const isExpanded = expandedNodes[node.id] !== false;
    const hasChildren = node.children && node.children.length > 0;
    const isSelf = isSameAccount(node);
    const isRoot = node.role === 'root';
    const nodeKind = getRoleKind(node);
    const isOwnerOrRootNode = nodeKind === 'owner' || nodeKind === 'root';
    const canManageNode = canManageUser(currentUser, node);
    const canDeleteNode = canManageNode && !isSelf && !isOwnerOrRootNode;
    const grantedOwnerGrade = getGrantedOwnerGradeKeys(node.permissions);

    return (
      <div key={node.id} className="relative">
        {/* Node Card */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border transition-all my-2 ${
            isRoot
              ? 'bg-brand-soft/40 dark:bg-brand-dark-soft border-brand/40 dark:border-brand-bright/40 shadow-xs'
              : !node.isActive
              ? 'bg-surface-2/60 dark:bg-surface-dark-2/60 border-line dark:border-line-dark opacity-75'
              : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:shadow-xs'
          }`}
          style={{ marginRight: `${level * 24}px` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Expand / Collapse Button */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNode(node.id)}
                className="w-7 h-7 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer shrink-0"
                title={isExpanded ? 'طي الفروع' : 'توسيع الفروع'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
              </button>
            ) : (
              <div className="w-7 h-7 flex items-center justify-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-line dark:bg-line-dark" />
              </div>
            )}

            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                isRoot
                  ? 'bg-brand text-white'
                  : nodeKind === 'owner' || nodeKind === 'manager'
                  ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border'
                  : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border border-line dark:border-line-dark'
              }`}
            >
              {isRoot ? <ShieldCheck className="w-5 h-5 shrink-0" /> : node.displayName.slice(0, 1)}
            </div>

            {/* Info */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="font-bold text-sm text-ink dark:text-ink-dark truncate">{node.displayName}</span>
                <span className="font-mono text-xs text-ink-muted dark:text-ink-muted-dark dir-ltr">@{node.username}</span>
                {isSelf && (
                  <span className="text-micro font-bold bg-paid/10 dark:bg-paid-dark-soft text-paid dark:text-paid-bright px-2 py-0.5 rounded-full border border-paid/20 dark:border-paid-dark-border shrink-0">
                    أنت
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 whitespace-nowrap">
                {renderRoleBadge(node)}

                {/* Status Indicator */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold whitespace-nowrap shrink-0 ${
                    node.isActive
                      ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border'
                      : 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-dark-soft'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${node.isActive ? 'bg-paid dark:bg-paid-bright' : 'bg-danger dark:bg-danger-bright'}`} />
                  <span>{node.isActive ? 'نشط' : 'معطّل'}</span>
                </span>

                {/* Last Login Indicator */}
                {node.lastLoginAt && (
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark whitespace-nowrap shrink-0">
                    آخر دخول: {formatLastLogin(node.lastLoginAt)}
                  </span>
                )}
              </div>

              {/* Owner-grade privileges granted to this manager */}
              {nodeKind === 'manager' && grantedOwnerGrade.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {grantedOwnerGrade.map((key) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold whitespace-nowrap bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30"
                    >
                      <ShieldCheck className="w-3 h-3 shrink-0" />
                      <span>{OWNER_GRADE_CHIP_LABELS[key]}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
            {/* Permissions: owner/root are always full; cashiers get the matrix; a manager gets the owner-grade panel (owner/root viewers only) */}
            {isOwnerOrRootNode ? (
              <span
                className="px-2.5 py-1.5 bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-xs font-bold rounded-lg border border-paid-border dark:border-paid-dark-border flex items-center gap-1.5 shadow-2xs select-none whitespace-nowrap shrink-0"
                title={nodeKind === 'root' ? 'حساب المطور (Root) يمتلك كامل الصلاحيات دائماً' : 'المالك يمتلك كامل الصلاحيات دائماً'}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                <span>كامل الصلاحيات</span>
              </span>
            ) : canManageNode && (nodeKind === 'cashier' || (nodeKind === 'manager' && viewerTier >= 2)) ? (
              <button
                type="button"
                onClick={() => (nodeKind === 'manager' ? handleStartOwnerGrade(node) : handleStartPermissions(node))}
                className="px-2.5 py-1.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark text-xs font-bold rounded-lg border border-line dark:border-line-dark transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title={nodeKind === 'manager' ? 'منح المدير صلاحيات خاصة بالمالك' : 'تعديل مصفوفة الصلاحيات'}
              >
                <Shield className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                <span>الصلاحيات</span>
              </button>
            ) : null}

            {/* Change PIN */}
            {(canManageNode || isSelf) && (
              <button
                type="button"
                onClick={() => handleStartCredentials(node)}
                className="px-2.5 py-1.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark text-xs font-bold rounded-lg border border-line dark:border-line-dark transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title="تغيير الرقم السري (PIN)"
              >
                <Key className="w-3.5 h-3.5 text-warn dark:text-warn-bright shrink-0" />
                <span>الرقم السري</span>
              </button>
            )}

            {/* Edit Profile */}
            {(canManageNode || isSelf) && (
              <button
                type="button"
                onClick={() => handleStartEdit(node)}
                className="px-2.5 py-1.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark text-ink dark:text-ink-dark text-xs font-bold rounded-lg border border-line dark:border-line-dark transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title="تعديل بيانات الحساب"
              >
                <Edit3 className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark shrink-0" />
                <span>تعديل</span>
              </button>
            )}

            {/* Toggle Status (Active / Deactive) */}
            {canDeleteNode && (
              <button
                type="button"
                onClick={() => handleToggleStatus(node)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  node.isActive
                    ? 'bg-danger-soft dark:bg-danger-dark-soft hover:bg-danger/20 dark:hover:bg-danger-dark-soft/80 text-danger dark:text-danger-bright border-danger-border dark:border-danger-dark-soft'
                    : 'bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid/20 dark:hover:bg-brand-container text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border'
                }`}
                title={node.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
              >
                {node.isActive ? <UserX className="w-4 h-4 shrink-0" /> : <UserCheck className="w-4 h-4 shrink-0" />}
              </button>
            )}

            {/* Delete (soft) */}
            {canDeleteNode && (
              <button
                type="button"
                onClick={() => setDeleteTarget(node)}
                className="p-1.5 rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 bg-danger-soft dark:bg-danger-dark-soft hover:bg-danger/20 dark:hover:bg-danger-dark-soft/80 text-danger dark:text-danger-bright border-danger-border dark:border-danger-dark-soft"
                title="حذف الحساب"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Render Children Nodes */}
        {hasChildren && isExpanded && (
          <div className="relative border-r-2 border-line/70 dark:border-line-dark/70 pr-2 mr-4 my-1">
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const isDirty = formMode !== 'none' && formMode !== 'ownerGrade' && Boolean(
    username.trim() ||
    displayName.trim() ||
    pin.trim()
  );

  const handleDismissAction = useCallback(() => {
    if (formMode !== 'none') {
      setFormMode('none');
    } else {
      onClose();
    }
  }, [formMode, onClose]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: handleDismissAction,
    isDirty,
    confirmTitle: 'إلغاء التعديلات غير المحفوظة؟',
    confirmMessage: 'تم إدخال تعديلات في بيانات الموظف. هل أنت متأكد من الإلغاء والتراجع دون حفظ؟',
    disabled: deleteTarget !== null,
  });

  if (!isOpen) return null;

  const editPrivileges = selectedUser ? getEditPrivileges(selectedUser) : null;

  return (
    <>
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh] transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-dark via-brand to-paid" />

        {/* Modal Header */}
        <div className="bg-surface dark:bg-surface-dark px-6 py-4 flex items-center justify-between border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 text-brand dark:text-brand-bright flex items-center justify-center shrink-0 shadow-2xs">
              <Users className="w-5 h-5 text-brand dark:text-brand-bright" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="t-modal-title text-ink dark:text-ink-dark">إدارة حسابات الموظفين والكاشير</h2>
                {isRootSession ? (
                  <span className="bg-brand text-white text-micro px-2.5 py-0.5 rounded-full font-bold shadow-2xs flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>جلسة المطور (Root)</span>
                  </span>
                ) : (
                  <span className="bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-micro px-2.5 py-0.5 rounded-full font-bold border border-brand/20 dark:border-brand-bright/20">
                    {getRoleLabel(currentUser)}
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark font-medium">
                إدارة الأرقام السرية (PIN) وتحديد صلاحيات كل موظف
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Close Button */}
            <button
              type="button"
              onClick={requestClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-danger-soft dark:bg-danger-dark-soft border-b border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright px-6 py-2.5 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-danger dark:text-danger-bright" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError('')} className="text-danger dark:text-danger-bright hover:text-ink dark:hover:text-ink-dark font-bold cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="bg-paid-soft dark:bg-paid-dark-soft border-b border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright px-6 py-2.5 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg('')} className="text-paid dark:text-paid-bright hover:text-ink dark:hover:text-ink-dark font-bold cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 bg-canvas dark:bg-canvas-dark overflow-y-auto flex-1 custom-scrollbar">
          {/* ======================================================== */}
          {/* 1. MAIN LIST / TREE VIEW                                 */}
          {/* ======================================================== */}
          {formMode === 'none' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 max-w-sm relative">
                  <Search className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث بالاسم أو اسم الدخول أو الدور..."
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl pr-9 pl-3.5 py-2 text-ink dark:text-ink-dark placeholder:text-ink-muted/60 dark:placeholder:text-ink-muted-dark/60 focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartAdd()}
                    className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>إضافة حساب موظف جديد</span>
                  </button>
                </div>
              </div>

              {/* UNIFIED EMPLOYEE LIST */}
              <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark p-4 shadow-2xs overflow-x-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-line dark:border-line-dark text-xs text-ink-muted dark:text-ink-muted-dark font-bold">
                  <span>قائمة وحسابات الموظفين</span>
                  <span>{users.length} حساب مسجل</span>
                </div>

                {loading && users.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted dark:text-ink-muted-dark text-xs">جاري تحميل بيانات الموظفين...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted dark:text-ink-muted-dark text-xs">لا يوجد موظفون يطابقون كلمة البحث.</div>
                ) : searchQuery.trim() ? (
                  <div>{filteredUsers.map((u) => renderTreeNode(u, 0))}</div>
                ) : (
                  <div>{userTree.map((rootNode) => renderTreeNode(rootNode, 0))}</div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 2. ADD USER / SUB-USER FORM                              */}
          {/* ======================================================== */}
          {formMode === 'add' && (
            <form onSubmit={handleSubmitAdd} className="max-w-3xl mx-auto space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-line dark:border-line-dark">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand dark:text-brand-bright" />
                  <h3 className="t-card-title text-ink dark:text-ink-dark">إضافة حساب موظف جديد</h3>
                </div>
              </div>
              <p className="text-micro text-ink-muted dark:text-ink-muted-dark m-0">الحقول المميزة بعلامة * مطلوبة</p>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">اسم الموظف الكامل <RequiredMark /></label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="مثال: محمد أحمد (كاشير الوردية الأولى)"
                    className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2.5 text-ink dark:text-ink-dark text-xs focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">اسم المستخدم (للدخول السريع) <RequiredMark /></label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: cashier1"
                    className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2.5 text-ink dark:text-ink-dark text-xs font-mono focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
              </div>

              {/* Role Selection: only the owner / root may create a manager */}
              {canChooseManagerRole ? (
              <div className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-line dark:border-line-dark space-y-3">
                <label className="block text-xs font-bold text-ink dark:text-ink-dark">الدور الوظيفي</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('cashier')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      role === 'cashier'
                        ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand dark:border-brand-bright ring-1 ring-brand/50 dark:ring-brand-bright/50'
                        : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/40'
                    }`}
                  >
                    <div className="font-bold text-ink dark:text-ink-dark text-xs">{ROLE_LABEL_CASHIER}</div>
                    <div className="text-micro text-ink-muted dark:text-ink-muted-dark mt-0.5">
                      مخصص للمبيعات المباشرة وخدمة العملاء وفق الصلاحيات الممنوحة
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      role === 'admin'
                        ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid dark:border-paid-bright ring-1 ring-paid/50 dark:ring-paid-bright/50'
                        : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-paid/40'
                    }`}
                  >
                    <div className="font-bold text-ink dark:text-ink-dark text-xs">{ROLE_LABEL_MANAGER}</div>
                    <div className="text-micro text-ink-muted dark:text-ink-muted-dark mt-0.5">
                      يدير الكاشيرية والورديات والمخزن بكامل صلاحيات التشغيل
                    </div>
                  </button>
                </div>
              </div>
              ) : null}

              {/* Credentials: PIN only */}
              <div className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-line dark:border-line-dark space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark">الرقم السري للدخول (PIN)</label>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark">من 4 إلى 8 أرقام</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-micro font-semibold text-ink-muted dark:text-ink-muted-dark mb-1">
                      الرقم السري (PIN) <RequiredMark />
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2 text-ink dark:text-ink-dark text-xs font-mono focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                  </div>
                  <div>
                    <label className="block text-micro font-semibold text-ink-muted dark:text-ink-muted-dark mb-1">تأكيد الرقم السري (PIN) <RequiredMark /></label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2 text-ink dark:text-ink-dark text-xs font-mono focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                  </div>
                </div>
              </div>

              {!canChooseManagerRole || role === 'cashier' ? (
              /* Permissions Matrix */
              <div className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-line dark:border-line-dark space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-ink dark:text-ink-dark">مصفوفة الصلاحيات الممنوحة</div>
                    <div className="text-micro text-ink-muted dark:text-ink-muted-dark">
                      أي صلاحية يتم تفعيلها هنا ستظهر للموظف في واجهته، وتختفي تماماً الصلاحيات غير المحددة
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleAllPermissions(true)}
                      className="text-xs font-bold text-brand dark:text-brand-bright hover:underline cursor-pointer"
                    >
                      تحديد الكل المتاح
                    </button>
                    <span className="text-ink-muted dark:text-ink-muted-dark">|</span>
                    <button
                      type="button"
                      onClick={() => handleToggleAllPermissions(false)}
                      className="text-xs font-bold text-danger dark:text-danger-bright hover:underline cursor-pointer"
                    >
                      إلغاء الكل
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {visiblePermissionGroups.map((group) => {
                    const availableItems = group.items.filter((item) => parentHoldsPermission(item.key));
                    const allChecked = availableItems.length > 0 && availableItems.every((item) => !!permissionsState[item.key]);

                    return (
                      <div key={group.id} className="border border-line dark:border-line-dark rounded-xl p-3 bg-canvas/40 dark:bg-canvas-dark/40">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-line dark:border-line-dark">
                          <div className="flex items-center gap-2">
                            {PERMISSION_ICONS[group.icon]}
                            <span className="font-bold text-xs text-ink dark:text-ink-dark">{group.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleGroup(group, !allChecked)}
                            className={`text-micro font-bold hover:underline cursor-pointer ${allChecked ? 'text-danger dark:text-danger-bright' : 'text-brand dark:text-brand-bright'}`}
                          >
                            {allChecked ? 'إلغاء تحديد القسم' : 'تحديد القسم بالكامل'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {group.items.map((item) => {
                            const allowedByParent = parentHoldsPermission(item.key);
                            const isChecked = !!permissionsState[item.key] && allowedByParent;

                            return (
                              <div
                                key={item.key}
                                onClick={() => allowedByParent && handleTogglePermission(item.key)}
                                className={`flex items-start gap-2 p-2 rounded-lg border transition-all ${
                                  !allowedByParent
                                    ? 'bg-surface-2/40 dark:bg-surface-dark-2/40 border-line/50 dark:border-line-dark/50 opacity-40 cursor-not-allowed'
                                    : isChecked
                                    ? 'bg-brand-soft/50 dark:bg-brand-dark/50 border-brand/40 dark:border-brand-bright/40 cursor-pointer'
                                    : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/30 cursor-pointer'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  {!allowedByParent ? (
                                    <Lock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark" />
                                  ) : isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-brand dark:text-brand-bright" />
                                  ) : (
                                    <Square className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark" />
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-ink dark:text-ink-dark">{item.label}</span>
                                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-tight">
                                    {!allowedByParent ? 'محجوبة: لا يمتلكها المشرف' : item.description}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              ) : (
                <div className="bg-paid-soft dark:bg-paid-dark-soft p-3 rounded-2xl border border-paid-border dark:border-paid-dark-border text-xs text-paid dark:text-paid-bright font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>المدير يمتلك كامل صلاحيات التشغيل ولا تُحدد له صلاحيات فردية.</span>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ وإنشاء الحساب في الشجرة'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* 3. EDIT USER DETAILS FORM                                */}
          {/* ======================================================== */}
          {formMode === 'edit' && selectedUser && (
            <form onSubmit={handleSubmitEdit} className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line dark:border-line-dark">
                <h3 className="t-card-title text-ink dark:text-ink-dark">تعديل بيانات الحساب: {selectedUser.displayName}</h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-muted dark:text-ink-muted-dark mb-1">اسم المستخدم</label>
                <input
                  type="text"
                  disabled
                  value={username}
                  className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2.5 text-ink-muted dark:text-ink-muted-dark text-xs font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">اسم الموظف الظاهر <RequiredMark /></label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2.5 text-ink dark:text-ink-dark text-xs focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
              </div>

              {getTier(selectedUser) >= 2 ? (
                <div className="p-3 bg-brand-soft dark:bg-brand-dark/40 border border-brand/30 dark:border-brand-bright/30 rounded-xl text-brand dark:text-brand-bright text-xs font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{getRoleLabel(selectedUser)}: صلاحيات كاملة ودائمة، ولا يمكن تغيير الدور أو تعطيل الحساب.</span>
                </div>
              ) : (
                <>
                  {editPrivileges?.canChangeRole ? (
                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">الدور الوظيفي</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRole('cashier')}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          role === 'cashier'
                            ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand dark:border-brand-bright ring-1 ring-brand/50 dark:ring-brand-bright/50'
                            : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/40'
                        }`}
                      >
                        <div className="font-bold text-ink dark:text-ink-dark text-xs">{ROLE_LABEL_CASHIER}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('admin')}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          role === 'admin'
                            ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid dark:border-paid-bright ring-1 ring-paid/50 dark:ring-paid-bright/50'
                            : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-paid/40'
                        }`}
                      >
                        <div className="font-bold text-ink dark:text-ink-dark text-xs">{ROLE_LABEL_MANAGER}</div>
                      </button>
                    </div>
                  </div>
                  ) : (
                  <div className="flex items-center justify-between p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl">
                    <span className="text-xs font-bold text-ink dark:text-ink-dark">الدور الوظيفي</span>
                    {renderRoleBadge(selectedUser)}
                  </div>
                  )}

                  {editPrivileges?.canChangeActive ? (
                  <div className="flex items-center justify-between p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-ink dark:text-ink-dark">حساب نشط</span>
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark">
                        عند التعطيل، يتم حظر تسجيل دخول الموظف
                      </span>
                    </div>
                    <ToggleSwitch checked={isActive} onChange={(val) => setIsActive(val)} />
                  </div>
                  ) : null}
                </>
              )}

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* 4. MANAGE PERMISSIONS MATRIX MODAL                       */}
          {/* ======================================================== */}
          {formMode === 'permissions' && selectedUser && (
            <form onSubmit={handleSubmitPermissions} className="max-w-3xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line dark:border-line-dark">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-brand dark:text-brand-bright" />
                  <div>
                    <h3 className="t-card-title text-ink dark:text-ink-dark">تعديل مصفوفة صلاحيات: {selectedUser.displayName}</h3>
                    <p className="text-micro text-ink-muted dark:text-ink-muted-dark">
                      التحكم الدقيق في ظهور وإخفاء أقسام وميزات البرنامج لهذا الموظف
                    </p>
                  </div>
                </div>
              </div>

              {/* Cascade Warning Alert */}
              <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl flex items-start gap-2.5 text-xs text-warn dark:text-warn-bright">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">خد بالك لو لغيت صلاحية من هنا:</span>
                  <p className="mt-0.5 text-micro leading-relaxed">
                    أي صلاحية هتشيلها من الموظف ده، هتتشال تلقائياً وفوراً من كل الموظفين التابعين ليه وتحت إشرافه.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink dark:text-ink-dark">مجموعات الصلاحيات:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleAllPermissions(true)}
                    className="text-xs font-bold text-brand dark:text-brand-bright hover:underline cursor-pointer"
                  >
                    تحديد الكل المتاح
                  </button>
                  <span className="text-ink-muted dark:text-ink-muted-dark">|</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAllPermissions(false)}
                    className="text-xs font-bold text-danger dark:text-danger-bright hover:underline cursor-pointer"
                  >
                    إلغاء الكل
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {visiblePermissionGroups.map((group) => {
                  const availableItems = group.items.filter((item) => parentHoldsPermission(item.key));
                  const allChecked = availableItems.length > 0 && availableItems.every((item) => !!permissionsState[item.key]);

                  return (
                    <div key={group.id} className="border border-line dark:border-line-dark rounded-xl p-3 bg-surface dark:bg-surface-dark">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-line dark:border-line-dark">
                        <div className="flex items-center gap-2">
                          {PERMISSION_ICONS[group.icon]}
                          <span className="font-bold text-xs text-ink dark:text-ink-dark">{group.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleGroup(group, !allChecked)}
                          className={`text-micro font-bold hover:underline cursor-pointer ${allChecked ? 'text-danger dark:text-danger-bright' : 'text-brand dark:text-brand-bright'}`}
                        >
                          {allChecked ? 'إلغاء تحديد القسم' : 'تحديد القسم بالكامل'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {group.items.map((item) => {
                          const allowedByParent = parentHoldsPermission(item.key);
                          const isChecked = !!permissionsState[item.key] && allowedByParent;

                          return (
                            <div
                              key={item.key}
                              onClick={() => allowedByParent && handleTogglePermission(item.key)}
                              className={`flex items-start gap-2 p-2 rounded-lg border transition-all ${
                                !allowedByParent
                                  ? 'bg-surface-2/40 dark:bg-surface-dark-2/40 border-line/50 dark:border-line-dark/50 opacity-40 cursor-not-allowed'
                                  : isChecked
                                  ? 'bg-brand-soft/50 dark:bg-brand-dark/50 border-brand/40 dark:border-brand-bright/40 cursor-pointer'
                                  : 'bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-brand/30 cursor-pointer'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {!allowedByParent ? (
                                  <Lock className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark" />
                                ) : isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-brand dark:text-brand-bright" />
                                ) : (
                                  <Square className="w-4 h-4 text-ink-muted dark:text-ink-muted-dark" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-ink dark:text-ink-dark">{item.label}</span>
                                <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-tight">
                                  {!allowedByParent ? 'محجوبة: لا يمتلكها المشرف' : item.description}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ وتطبيق الصلاحيات فورياً'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* 5. CREDENTIALS MANAGER (PASSWORD / PIN)                  */}
          {/* ======================================================== */}
          {formMode === 'credentials' && selectedUser && (
            <form onSubmit={handleSubmitCredentials} className="max-w-md mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line dark:border-line-dark">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-warn dark:text-warn-bright" />
                  <h3 className="t-card-title text-ink dark:text-ink-dark">تغيير الرقم السري (PIN): {selectedUser.displayName}</h3>
                </div>
              </div>

              {/* Informative Guidance Notice */}
              <div className="bg-surface-2 dark:bg-surface-dark-2 p-3 rounded-xl border border-line dark:border-line-dark text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                تُستخدم هذه النافذة لإعادة تعيين الرقم السري (PIN) الخاص بالموظف في حال نسيانه أو الحاجة لتحديثه، دون التأثير على صلاحياته أو بياناته.
              </div>

              {selectedUser.hasPassword && selectedUser.hasPin === false && (
                <div className="bg-warn-soft dark:bg-warn-dark-soft p-3 rounded-xl border border-warn/20 dark:border-warn-bright/30 text-xs text-warn dark:text-warn-bright font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>هذا الحساب يدخل بكلمة مرور قديمة؛ عيّن PIN جديداً.</span>
                </div>
              )}

              {/* Current PIN prompt if editing an owner / manager / root account */}
              {getTier(selectedUser) >= 1 && (
                <div className="bg-warn-soft dark:bg-warn-dark-soft p-3 rounded-xl border border-warn/20 dark:border-warn-bright/30 space-y-1.5">
                  <label className="block text-xs font-bold text-warn dark:text-warn-bright">
                    {credUsesSupervisorPin(selectedUser) ? 'رقم المالك السري (للتأكيد)' : 'الرقم السري الحالي (لتأكيد الهوية)'}{!isRootSession && <> <RequiredMark /></>}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={currentCredential}
                    onChange={(e) => setCurrentCredential(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-surface dark:bg-surface-dark-2 border border-warn/40 dark:border-warn-bright/40 rounded-xl px-3 py-2 text-ink dark:text-ink-dark text-xs focus:outline-none focus:border-warn font-mono"
                  />
                  <p className="text-micro text-warn dark:text-warn-bright font-medium">
                    {credUsesSupervisorPin(selectedUser)
                      ? 'لحماية النظام: إعادة تعيين رقم مدير تتطلب تأكيد رقمك السري كمالك.'
                      : 'لحماية النظام: تعديل حسابات الإدارة قد يتطلب تأكيد الرقم السري الحالي.'}
                  </p>
                </div>
              )}

              {/* New PIN */}
              <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark space-y-3">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">الرقم السري الجديد (PIN: 4 - 8 أرقام) <RequiredMark /></label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    autoFocus
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2 text-ink dark:text-ink-dark text-sm font-mono focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
                <div>
                  <label className="block text-micro font-semibold text-ink-muted dark:text-ink-muted-dark mb-1">تأكيد الرقم السري الجديد <RequiredMark /></label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2 text-ink dark:text-ink-dark text-sm font-mono focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ الرقم السري'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* 6. OWNER-GRADE PRIVILEGES OF A MANAGER                   */}
          {/* ======================================================== */}
          {formMode === 'ownerGrade' && selectedUser && (
            <form onSubmit={handleSubmitOwnerGrade} className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line dark:border-line-dark">
                <div className="flex items-center gap-2">
                  {PERMISSION_ICONS[OWNER_GRADE_GROUP.icon]}
                  <div>
                    <h3 className="t-card-title text-ink dark:text-ink-dark">{OWNER_GRADE_GROUP.name}: {selectedUser.displayName}</h3>
                    <p className="text-micro text-ink-muted dark:text-ink-muted-dark">
                      فعّل ما تريد منحه لهذا المدير، ويمكنك سحبه في أي وقت
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 rounded-xl flex items-start gap-2.5 text-xs text-brand dark:text-brand-bright">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-bold">المدير يملك باقي صلاحيات الإدارة اليومية تلقائياً</span>
              </div>

              <div className="space-y-2">
                {OWNER_GRADE_GROUP.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-ink dark:text-ink-dark">{item.label}</span>
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-tight">{item.description}</span>
                    </div>
                    <ToggleSwitch
                      checked={ownerGradeState[item.key] === true}
                      onChange={(val) => setOwnerGradeState((prev) => ({ ...prev, [item.key]: val }))}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>الأرقام السرية مشفرة ومحفوظة بأمان على جهازك</span>
          </div>
          <div className="flex items-center gap-3">
            <span>{viewerTier >= 2 ? 'يمكنك منح المديرين صلاحيات خاصة بالمالك' : 'المالك والمديرون يمتلكون صلاحيات التشغيل اليومية'}</span>
          </div>
        </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={deleteTarget !== null}
      title="حذف الحساب"
      message={deleteTarget ? `سيتم حذف حساب (${deleteTarget.displayName}) من القوائم ولن يتمكن من تسجيل الدخول بعد الآن.` : ''}
      consequence="الفواتير والحركات المسجلة باسمه تبقى محفوظة في السجل ولا تتأثر."
      confirmText="حذف الحساب"
      cancelText="تراجع"
      isDanger
      icon={<Trash2 className="w-5 h-5" />}
      onConfirm={() => void handleConfirmDelete()}
      onCancel={() => setDeleteTarget(null)}
    />
    </>
  );
};
