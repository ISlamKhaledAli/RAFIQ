import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Key,
  Lock,
  LogIn,
  Search,
  Check,
  X,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  CheckSquare,
  Square,
  Edit3,
  Eye,
  EyeOff,
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
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { UserDto } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { CustomSelect } from './CustomSelect';
import type { SelectOption } from './CustomSelect';
import { ToggleSwitch } from './ToggleSwitch';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface UserManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsersChanged?: () => void;
  supervisorPin?: string;
  currentUser?: UserDto | null;
}

interface PermissionItem {
  key: string;
  label: string;
  description: string;
}

interface PermissionGroup {
  id: string;
  name: string;
  icon: React.ReactNode;
  items: PermissionItem[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'pos',
    name: 'نقاط البيع والكاشير',
    icon: <ShoppingCart className="w-4 h-4 text-brand" />,
    items: [
      { key: 'pos.access', label: 'دخول شاشة البيع', description: 'السماح بفتح شاشة البيع وإجراء عمليات الكاشير' },
      { key: 'pos.sell', label: 'إتمام عمليات البيع', description: 'حفظ الفاتورة وقبض القيمة وطباعة الإيصال' },
      { key: 'pos.discount_line', label: 'خصم على صنف', description: 'إمكانية إعطاء خصم على صنف معين' },
      { key: 'pos.discount_invoice', label: 'خصم على الفاتورة', description: 'إمكانية إعطاء خصم إجمالي على الفاتورة' },
      { key: 'pos.discount_unlimited', label: 'تجاوز حد الخصم', description: 'إمكانية إعطاء خصومات تفوق النسبة المحددة للمحل' },
      { key: 'pos.hold_invoice', label: 'تعليق واسترجاع الفواتير', description: 'تعليق الطلبات في الوردية واستئنافها لاحقاً' },
      { key: 'pos.price_override', label: 'تعديل السعر يدوياً', description: 'تغيير سعر بيع الصنف مباشرة أثناء البيع' },
      { key: 'pos.void_line', label: 'حذف سطر من الفاتورة', description: 'حذف منتج تم إدخاله في الفاتورة الحالية' },
      { key: 'pos.quick_add', label: 'إضافة صنف سريع', description: 'إضافة بند مباشر بدون كود مسبق' },
      { key: 'pos.reprint', label: 'إعادة طباعة الفاتورة', description: 'إعادة طباعة إيصالات العمليات السابقة' },
    ],
  },
  {
    id: 'epay',
    name: 'خدمات وماكينات الدفع الإلكتروني',
    icon: <Smartphone className="w-4 h-4 text-brand" />,
    items: [
      { key: 'epay.access', label: 'دخول خدمات وماكينات الدفع', description: 'السماح بفتح قسم الدفع والخدمات الإلكترونية' },
      { key: 'epay.transact', label: 'تنفيذ عمليات الدفع وشحن الرصيد', description: 'تسجيل ودفع فواتير، كروت شحن، تحويل محافظ' },
      { key: 'epay.fund', label: 'تغذية وشحن رصيد الماكينات', description: 'إضافة وشحن رصيد لماكينات الدفع من الدرج أو البنك' },
      { key: 'epay.terminals_manage', label: 'إدارة وضبط ماكينات الدفع', description: 'إضافة وتعديل بيانات الماكينات وحساباتها والعمولات الافتراضية' },
      { key: 'epay.history', label: 'سجل العمليات والإيصالات', description: 'الاطلاع على أرشيف عمليات الدفع والإيصالات المطبوعة' },
      { key: 'epay.analytics', label: 'الاطلاع على أرباح وتحليلات الماكينات', description: 'عرض تقارير صافي الربح وعمولات الشركات المستقلة' },
      { key: 'epay.cancel', label: 'إلغاء واسترجاع عمليات الدفع', description: 'إلغاء عملية دفع إلكتروني مسجلة واسترجاع رصيد الماكينة تلقائياً' },
    ],
  },
  {
    id: 'invoices',
    name: 'الفواتير والمرتجعات',
    icon: <FileText className="w-4 h-4 text-brand" />,
    items: [
      { key: 'invoices.view', label: 'عرض سجل الفواتير', description: 'استعراض فواتير المبيعات السابقة' },
      { key: 'invoices.cancel', label: 'إلغاء الفواتير', description: 'إلغاء فاتورة مسجلة ورد البضاعة للمخزن' },
      { key: 'returns.create', label: 'عمل مرتجع بفاتورة', description: 'استرجاع بضاعة استناداً لرقم فاتورة أصلية' },
      { key: 'returns.without_invoice', label: 'مرتجع بدون فاتورة', description: 'استرجاع بضاعة نقدية بدون توفر الفاتورة الأصلية' },
    ],
  },
  {
    id: 'products',
    name: 'الأصناف والمخزون',
    icon: <Package className="w-4 h-4 text-brand" />,
    items: [
      { key: 'products.view', label: 'عرض الأصناف', description: 'استعراض قائمة المنتجات وأسعار البيع' },
      { key: 'products.create', label: 'إضافة صنف جديد', description: 'إدخال منتج جديد وتعيين باركود وسعر' },
      { key: 'products.edit', label: 'تعديل بيانات الأصناف', description: 'تعديل الاسم والباركود والوحدات' },
      { key: 'products.edit_price', label: 'تعديل سعر البيع', description: 'تعديل سعر البيع القطاعي والجملة' },
      { key: 'products.edit_cost', label: 'الاطلاع وتعديل التكلفة', description: 'رؤية سعر الشراء الحقيقي وتعديله' },
      { key: 'products.archive', label: 'أرشفة / حذف صنف', description: 'تعطيل أو حذف صنف من المنظومة' },
      { key: 'products.import', label: 'استيراد من إكسل', description: 'رفع ملفات إكسل لإضافة وتحديث المنتجات' },
      { key: 'products.export', label: 'تصدير المخزون', description: 'تصدير بيانات الأصناف والمخزون لملفات خارجية' },
      { key: 'categories.manage', label: 'إدارة التصنيفات', description: 'إضافة وتعديل أقسام المنتجات' },
      { key: 'stock.view', label: 'عرض كميات المخزون', description: 'الاطلاع على الجرد والأرصدة الحالية' },
      { key: 'stock.adjust', label: 'تسوية الجرد والمخزن', description: 'تعديل الكميات يدوياً بعد الجرد الفعلي' },
      { key: 'stock.movement_log', label: 'سجل حركة المخزون', description: 'متابعة كارت الصنف وتقرير حركاته' },
    ],
  },
  {
    id: 'purchases',
    name: 'المشتريات والموردين',
    icon: <Truck className="w-4 h-4 text-brand" />,
    items: [
      { key: 'purchases.view', label: 'عرض المشتريات', description: 'استعراض فواتير التوريد من الموردين' },
      { key: 'purchases.create', label: 'تسجيل فاتورة شراء', description: 'إضافة وارد بضاعة وتحديث التكلفة والأرصدة' },
      { key: 'suppliers.manage', label: 'إدارة الموردين', description: 'إضافة الموردين ومتابعة كشوف حساباتهم وسدادهم' },
    ],
  },
  {
    id: 'customers',
    name: 'العملاء والآجل والديون',
    icon: <CreditCard className="w-4 h-4 text-brand" />,
    items: [
      { key: 'customers.view', label: 'عرض العملاء', description: 'استعراض بيانات العملاء وأرقام هواتفهم' },
      { key: 'customers.create', label: 'إضافة عميل جديد', description: 'تسجيل عميل جديد وفتح ملف حساب' },
      { key: 'customers.edit', label: 'تعديل بيانات العميل', description: 'تعديل الهاتف وسقف المديونية والاسم' },
      { key: 'customers.ledger', label: 'كشف حساب العميل', description: 'استعراض سجل المعاملات والديون السابقة' },
      { key: 'customers.payment', label: 'سداد دفعة / قبض دين', description: 'تسجيل تحصيل مالي من العميل وتوريده للخزينة' },
      { key: 'customers.payment_cancel', label: 'إلغاء سند قبض', description: 'إلغاء دفعة مسجلة للعميل' },
      { key: 'customers.credit_sale', label: 'البيع الآجل', description: 'إمكانية إتمام فواتير بيع بالآجل على الحساب' },
    ],
  },
  {
    id: 'reports',
    name: 'التقارير المالية والأرباح',
    icon: <BarChart2 className="w-4 h-4 text-brand" />,
    items: [
      { key: 'reports.sales', label: 'تقارير المبيعات', description: 'استعراض تقارير فواتير المبيعات وحركة الأصناف' },
      { key: 'reports.profit', label: 'تقارير الأرباح والخسائر', description: 'الاطلاع على هامش وصافي الربح المالي' },
      { key: 'reports.inventory', label: 'تقييم المخزون المالي', description: 'قيمة البضاعة بسعر التكلفة والبيع' },
      { key: 'reports.customers', label: 'تقرير مديونيات العملاء', description: 'إجمالي الديون المعلقة وأعمار الديون' },
      { key: 'reports.cashier', label: 'تقرير أداء الكاشير', description: 'مبيعات وإيرادات كل موظف على حدة' },
      { key: 'reports.daily_closing', label: 'إقفال الوردية واليومية', description: 'إجراء تقفيل الصندوق واليومية Z-Report' },
    ],
  },
  {
    id: 'settings',
    name: 'إعدادات النظام والنسخ الاحتياطي',
    icon: <Settings className="w-4 h-4 text-brand" />,
    items: [
      { key: 'settings.store', label: 'بيانات المحل والفاتورة', description: 'تعديل اسم المحل والهاتف وترويسة الإيصال' },
      { key: 'settings.printer', label: 'إعدادات الطابعات', description: 'ضبط طابعة الإيصالات وهوامش الطباعة' },
      { key: 'settings.barcode', label: 'إعدادات الباركود والميزان', description: 'ضبط الباركود وقارئ الميزان الإلكتروني' },
      { key: 'settings.features', label: 'خصائص النظام المتقدمة', description: 'تفعيل الميزات الإضافية كالأقساط والمخازن المتعددة' },
      { key: 'settings.backup', label: 'النسخ الاحتياطي', description: 'تصدير نسخة احتياطية من قاعدة البيانات' },
      { key: 'settings.restore', label: 'استعادة النسخ الاحتياطي', description: 'استرجاع بيانات سابقة للنظام' },
      { key: 'settings.license', label: 'معلومات الترخيص', description: 'الاطلاع على حالة التفعيل والنسخة' },
    ],
  },
  {
    id: 'users',
    name: 'إدارة الهيكل الإداري والموظفين',
    icon: <Users className="w-4 h-4 text-brand" />,
    items: [
      { key: 'users.view', label: 'استعراض شجرة الموظفين', description: 'رؤية الهيكل الإداري والحسابات التابعة' },
      { key: 'users.create', label: 'إنشاء حسابات فرعية', description: 'إضافة حسابات جديدة تحت إشراف الحساب' },
      { key: 'users.edit', label: 'تعديل بيانات الحسابات', description: 'تعديل أسماء وأدوار الحسابات التابعة' },
      { key: 'users.deactivate', label: 'تفعيل وتعطيل الحسابات', description: 'إيقاف الحسابات التابعة وتفعيلها' },
      { key: 'users.reset_pin', label: 'تغيير كلمات المرور و PIN', description: 'إعادة ضبط أرقام الدخول للحسابات التابعة' },
      { key: 'users.delegate', label: 'منح حق التفويض', description: 'السماح للحساب بإنشاء حسابات فرعية وتفويضها' },
      { key: 'audit_log.view', label: 'سجل التدقيق والرقابة', description: 'الاطلاع على جميع العمليات الحساسة في المحل' },
    ],
  },
  {
    id: 'expenses',
    name: 'المصروفات والخزينة',
    icon: <DollarSign className="w-4 h-4 text-brand" />,
    items: [
      { key: 'expenses.view', label: 'عرض المصروفات', description: 'استعراض قيود الصرف وسجلات الخزينة' },
      { key: 'expenses.create', label: 'تسجيل مصروف جديد', description: 'سحب مبالغ من الدرج وتسجيل البند والسبب' },
      { key: 'expenses.delete', label: 'حذف قيود المصروفات', description: 'إلغاء قيد صرف مالي' },
    ],
  },
];

export const UserManagerModal: React.FC<UserManagerModalProps> = ({
  isOpen,
  onClose,
  onUsersChanged,
  supervisorPin,
  currentUser: propCurrentUser,
}) => {
  const { currentUser: authUser, isRoot, login } = useAuth();
  const currentUser = propCurrentUser || authUser;
  const isRootSession = isRoot || currentUser?.role === 'root' || currentUser?.username === 'root';
  const [users, setUsers] = useState<UserDto[]>([]);
  const [userTree, setUserTree] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form modes: 'none' | 'add' | 'edit' | 'permissions' | 'credentials' | 'switchLogin'
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit' | 'permissions' | 'credentials' | 'switchLogin'>('none');
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const [credMethod, setCredMethod] = useState<'pin' | 'password'>('pin');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Form Fields
  const [parentId, setParentId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentCredential, setCurrentCredential] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [switchSecret, setSwitchSecret] = useState('');
  const [showSwitchSecret, setShowSwitchSecret] = useState(false);
  const [canDelegate, setCanDelegate] = useState(false);
  const [maxDepth, setMaxDepth] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [permissionsState, setPermissionsState] = useState<Record<string, boolean>>({});

  // Tree expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});


  // Helper to construct local hierarchy if getTree returns flat
  const buildTreeFromFlat = (flatList: UserDto[]): UserDto[] => {
    const map = new Map<string, UserDto>();
    const roots: UserDto[] = [];

    flatList.forEach((u) => {
      map.set(u.id, { ...u, children: [] });
    });

    flatList.forEach((u) => {
      const node = map.get(u.id);
      if (!node) return;
      if (u.parentId && map.has(u.parentId)) {
        const parentNode = map.get(u.parentId);
        if (parentNode) {
          parentNode.children = parentNode.children || [];
          parentNode.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const allUsersPromise = invoke<UserDto[]>('users:getAll', supervisorPin ? { supervisorPin } : undefined);
      const treePromise = invoke<UserDto[]>('users:getTree').catch(() => []);

      const [allList, treeList] = await Promise.all([allUsersPromise, treePromise]);
      const visibleUsers = (allList || []).filter((u) => isRootSession || u.role !== 'root');
      setUsers(visibleUsers);

      const hasVisibleTree = treeList && treeList.length > 0 && (isRootSession || !treeList.some((t) => t.role === 'root'));
      if (hasVisibleTree) {
        setUserTree(treeList);
      } else {
        // Fallback: Build tree locally from visible users
        const tree = buildTreeFromFlat(visibleUsers);
        setUserTree(tree);
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات المستخدمين والهيكل الإداري.');
    } finally {
      setLoading(false);
    }
  }, [supervisorPin, isRootSession]);

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

  // Check if user is Store Owner or protected Administrator (Cannot have permissions stripped or be deactivated)
  const isOwnerOrAdmin = useCallback((u: UserDto | null | undefined): boolean => {
    if (!u) return false;
    return u.role === 'root' || u.role === 'admin' || u.username === 'admin';
  }, []);

  // Parent user for permission capping
  const activeParentUser = useMemo(() => {
    if (!parentId) {
      return currentUser || users.find((u) => u.role === 'root' || u.role === 'admin') || null;
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

      // 3. Store Owner / Admin: holds all system permissions by default unless explicitly revoked by Root
      if (!activeParentUser || isOwnerOrAdmin(activeParentUser)) {
        if (activeParentUser?.permissions && activeParentUser.permissions[permKey] === false) {
          return false;
        }
        return true;
      }

      // 4. Delegated sub-user (e.g. supervisor cashier): restricted to their assigned permissions
      if (!activeParentUser.permissions) return false;
      return !!activeParentUser.permissions[permKey];
    },
    [isRootSession, activeParentUser, isOwnerOrAdmin]
  );

  // Eligible Parents for creating a sub-user
  const eligibleParents = useMemo((): SelectOption[] => {
    // If root, can choose any user that can delegate, or themselves
    if (isRootSession) {
      return users
        .filter((u) => u.role === 'root' || u.canDelegate || u.role === 'admin')
        .map((u) => ({
          value: u.id,
          label: `${u.displayName} (@${u.username}) [${u.role === 'root' ? 'الروت الأعلى' : u.role === 'admin' ? 'مدير' : 'مفوّض'}]`,
        }));
    }
    // If regular user with delegation, can only be themselves
    if (currentUser) {
      return [
        {
          value: currentUser.id,
          label: `${currentUser.displayName} (@${currentUser.username}) [حسابك الحالي]`,
        },
      ];
    }
    return [];
  }, [isRootSession, currentUser, users]);

  // Start Add Sub-User
  const handleStartAdd = (targetParentId?: string) => {
    const chosenParentId = targetParentId || currentUser?.id || users[0]?.id || '';
    setParentId(chosenParentId);
    setUsername('');
    setDisplayName('');
    setRole('cashier');
    setPassword('');
    setPin('');
    setConfirmPin('');
    setShowPassword(false);
    setCanDelegate(false);
    setMaxDepth(1);
    setIsActive(true);

    // Default permissions based on cashier role
    const initialPerms: Record<string, boolean> = {};
    PERMISSION_GROUPS.forEach((g) => {
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
    setCanDelegate(!!user.canDelegate);
    setMaxDepth(user.maxDepth || 0);
    setIsActive(user.isActive);
    setFormMode('edit');
    setError('');
    setSuccessMsg('');
  };

  // Start Manage Permissions
  const handleStartPermissions = (user: UserDto) => {
    if (user.role === 'root' || user.username === 'root') {
      setError('حساب الروت يمتلك كافة صلاحيات النظام بشكل دائم وتلقائي، ولا يمكن تقييد أو سحب الصلاحيات منه.');
      return;
    }
    if (isOwnerOrAdmin(user) && !isRootSession) {
      setError('لا يمكن تعديل صلاحيات صاحب المحل والمدير إلا من خلال حساب الـ Root الأعلى.');
      return;
    }
    setSelectedUser(user);
    setParentId(user.parentId || '');

    // Fill current user permissions
    const perms: Record<string, boolean> = {};
    PERMISSION_GROUPS.forEach((g) => {
      g.items.forEach((p) => {
        if (user.permissions && user.permissions[p.key] !== undefined) {
          perms[p.key] = !!user.permissions[p.key];
        } else {
          perms[p.key] = user.role === 'root' || user.role === 'admin';
        }
      });
    });
    setPermissionsState(perms);
    setFormMode('permissions');
    setError('');
    setSuccessMsg('');
  };

  // Start Credentials Manager
  const handleStartCredentials = (user: UserDto) => {
    setSelectedUser(user);
    setPassword('');
    setPin('');
    setConfirmPin('');
    setCurrentCredential('');
    setShowPassword(false);
    setCredMethod(user.role === 'admin' || user.role === 'root' ? 'password' : 'pin');
    setFormMode('credentials');
    setError('');
    setSuccessMsg('');
  };

  // Start Switch Login
  const handleStartSwitchLogin = (user: UserDto) => {
    setSelectedUser(user);
    setSwitchSecret('');
    setShowSwitchSecret(false);
    setFormMode('switchLogin');
    setError('');
    setSuccessMsg('');
  };

  // Submit Switch Login
  const handleSubmitSwitchLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!switchSecret.trim()) {
      setError('يرجى إدخال الرقم السري (PIN) أو كلمة المرور للمتابعة.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await login(selectedUser.username, switchSecret.trim());
      if (res.success) {
        setSuccessMsg(`تم تسجيل الدخول بنجاح بحساب (${selectedUser.displayName}).`);
        if (onUsersChanged) onUsersChanged();
        setTimeout(() => {
          onClose();
        }, 400);
      } else {
        setError(res.message || 'بيانات الدخول غير صحيحة. يرجى المحاولة مجدداً.');
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر تسجيل الدخول.');
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

    if (!pin && !password) {
      setError('يجب تحديد كلمة مرور أو رقم سري (PIN) للدخول.');
      return;
    }

    if (pin) {
      if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
        setError('الرقم السري (PIN) يجب أن يتكون من 4 إلى 8 أرقام رقمية.');
        return;
      }
      if (pin !== confirmPin) {
        setError('الرقم السري وتأكيد الرقم السري غير متطابقين.');
        return;
      }
    }

    if (password && password.length < 4) {
      setError('كلمة المرور يجب ألا تقل عن 4 أحرف أو أرقام.');
      return;
    }

    // Verify delegation permission ceiling
    const finalPermissions: Record<string, boolean> = {};
    Object.keys(permissionsState).forEach((k) => {
      if (permissionsState[k]) {
        if (!parentHoldsPermission(k)) {
          // Parent doesn't hold it, cannot grant
          return;
        }
        finalPermissions[k] = true;
      }
    });

    setLoading(true);
    setError('');
    try {
      await invoke('users:createSubUser', {
        parentId: parentId || undefined,
        username: username.trim(),
        displayName: displayName.trim(),
        password: password ? password.trim() : undefined,
        pin: pin || undefined,
        role,
        canDelegate,
        maxDepth: canDelegate ? maxDepth : 0,
        permissions: finalPermissions,
      });

      setSuccessMsg(`تم إنشاء الحساب (${displayName}) بنجاح ضمن الهيكل الإداري.`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل إنشاء الحساب الجديد.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Edit Details
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !displayName.trim()) {
      setError('اسم الموظف مطلوب.');
      return;
    }

    if (isOwnerOrAdmin(selectedUser)) {
      if (!isActive) {
        setError('حساب صاحب المحل محمي ولا يمكن تعطيله مطلقاً.');
        return;
      }
      if (role !== 'admin') {
        setError('لا يمكن خفض رتبة حساب صاحب المحل.');
        return;
      }
    }

    if (selectedUser.role === 'root' && !isActive) {
      setError('حساب الروت الرئيسي محمي ولا يمكن تعطيله مطلقاً.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // 1. Update basic info
      await invoke('users:update', {
        id: selectedUser.id,
        displayName: displayName.trim(),
        role: selectedUser.role === 'root' ? 'root' : role,
        isActive: selectedUser.role === 'root' ? true : isActive,
        supervisorPin: supervisorPin || undefined,
      });

      // 2. Update delegation rights
      if (selectedUser.role !== 'root') {
        await invoke('users:setDelegation', {
          userId: selectedUser.id,
          canDelegate,
          maxDepth: canDelegate ? maxDepth : 0,
        });
      }

      setSuccessMsg('تم تحديث بيانات الحساب بنجاح.');
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

    if (selectedUser.role === 'root' || selectedUser.username === 'root') {
      setError('حساب الروت يمتلك كافة الصلاحيات بشكل دائم ولا يمكن تقييدها أو سحبها.');
      return;
    }
    if (isOwnerOrAdmin(selectedUser) && !isRootSession) {
      setError('لا يمكن تعديل صلاحيات صاحب المحل إلا من خلال حساب الـ Root الأعلى.');
      return;
    }

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

    setLoading(true);
    setError('');
    try {
      await invoke('users:updatePermissions', {
        userId: selectedUser.id,
        permissions: finalPerms,
      });

      setSuccessMsg(`تم تحديث مصفوفة الصلاحيات للحساب (${selectedUser.displayName}) بنجاح، وتطبيق السحب التلقائي على الفروع.`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل حفظ الصلاحيات.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Credentials (Password / PIN)
  const handleSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!pin && !password) {
      setError('يرجى إدخال كلمة مرور جديدة أو رقم سري (PIN) جديد.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // 1. If password provided
      if (password) {
        if (password.length < 4) {
          setError('كلمة المرور يجب ألا تقل عن 4 خانات.');
          setLoading(false);
          return;
        }
        await invoke('users:setPassword', {
          userId: selectedUser.id,
          newPassword: password.trim(),
          currentPassword: currentCredential || undefined,
        });
      }

      // 2. If PIN provided
      if (pin) {
        if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
          setError('الرقم السري (PIN) يجب أن يكون من 4 إلى 8 أرقام.');
          setLoading(false);
          return;
        }
        if (pin !== confirmPin) {
          setError('الرقم السري وتأكيد الرقم السري غير متطابقين.');
          setLoading(false);
          return;
        }
        await invoke('users:changePin', {
          id: selectedUser.id,
          newPin: pin,
          currentPin: currentCredential || undefined,
          supervisorPin: supervisorPin || undefined,
        });
      }

      setSuccessMsg(`تم تحديث بيانات الدخول للحساب (${selectedUser.displayName}) بنجاح.`);
      await loadData();
      setFormMode('none');
      if (onUsersChanged) onUsersChanged();
    } catch (err: any) {
      setError(err?.message || 'فشل تحديث بيانات الدخول.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle user active status directly
  const handleToggleStatus = async (user: UserDto) => {
    if (isOwnerOrAdmin(user)) {
      setError('حساب صاحب المحل محمي ضد التعطيل دائماً لضمان استمرارية عمل المتجر.');
      return;
    }
    if (currentUser?.id === user.id) {
      setError('لا يمكنك تعطيل حسابك الحالي المسجل دخوله.');
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
        supervisorPin: supervisorPin || undefined,
      });
      setSuccessMsg(
        user.isActive
          ? `تم تعطيل حساب (${user.displayName}) وتعطيل الحسابات التابعة له تلقائياً.`
          : `تم إعادة تفعيل حساب (${user.displayName}) بنجاح.`
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
      PERMISSION_GROUPS.forEach((g) => {
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

  // Render Role Badge
  const renderRoleBadge = (u: UserDto) => {
    if (u.role === 'root') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-brand text-white shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>الروت الأعلى (Root)</span>
        </span>
      );
    }
    if (u.role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-paid-soft text-paid border border-paid-border">
          <Shield className="w-3.5 h-3.5" />
          <span>صاحب المحل / مدير</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-surface-2 text-ink-muted border border-line">
        <Users className="w-3.5 h-3.5" />
        <span>كاشير / موظف</span>
      </span>
    );
  };

  // Format readable Arabic date/time for last login
  const formatLastLogin = (dateStr?: string | null) => {
    if (!dateStr) return 'لم يسجل دخول بعد';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'لم يسجل دخول بعد';
      const datePart = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
      const timePart = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${datePart} - ${timePart}`;
    } catch {
      return 'لم يسجل دخول بعد';
    }
  };

  // Render Recursive Tree Node
  const renderTreeNode = (node: UserDto, level = 0) => {
    const isExpanded = expandedNodes[node.id] !== false;
    const hasChildren = node.children && node.children.length > 0;
    const isSelf = currentUser?.id === node.id;
    const isRoot = node.role === 'root';
    const canCreateSub = isRootSession || (currentUser?.id === node.id && currentUser?.canDelegate);

    return (
      <div key={node.id} className="relative">
        {/* Node Card */}
        <div
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all my-2 ${
            isRoot
              ? 'bg-brand-soft/40 border-brand/40 shadow-xs'
              : !node.isActive
              ? 'bg-surface-2/60 border-line opacity-75'
              : 'bg-surface border-line hover:border-brand/40 hover:shadow-xs'
          }`}
          style={{ marginRight: `${level * 28}px` }}
        >
          <div className="flex items-center gap-3">
            {/* Expand / Collapse Button */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNode(node.id)}
                className="w-7 h-7 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title={isExpanded ? 'طي الفروع' : 'توسيع الفروع'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            ) : (
              <div className="w-7 h-7 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-line" />
              </div>
            )}

            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                isRoot
                  ? 'bg-brand text-white'
                  : node.role === 'admin'
                  ? 'bg-paid-soft text-paid border border-paid-border'
                  : 'bg-surface-2 text-ink border border-line'
              }`}
            >
              {isRoot ? <ShieldCheck className="w-5 h-5" /> : node.displayName.slice(0, 1)}
            </div>

            {/* Info */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-ink">{node.displayName}</span>
                <span className="font-mono text-xs text-ink-muted dir-ltr">@{node.username}</span>
                {isSelf && (
                  <span className="text-[10px] font-bold bg-paid/10 text-paid px-2 py-0.5 rounded-full border border-paid/20">
                    أنت
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                {renderRoleBadge(node)}

                {/* Status Indicator */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    node.isActive
                      ? 'bg-paid-soft text-paid border border-paid-border'
                      : 'bg-danger-soft text-danger border border-danger-border'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${node.isActive ? 'bg-paid' : 'bg-danger'}`} />
                  <span>{node.isActive ? 'نشط' : 'معطّل'}</span>
                </span>

                {/* Last Login Indicator */}
                {node.lastLoginAt && (
                  <span className="text-[11px] text-ink-muted">
                    آخر دخول: {formatLastLogin(node.lastLoginAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Add Sub-account under this node */}
            {(isRootSession || canCreateSub) && (
              <button
                type="button"
                onClick={() => handleStartAdd(node.id)}
                className="px-2.5 py-1.5 bg-brand-soft hover:bg-brand/20 text-brand text-xs font-bold rounded-lg border border-brand/20 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="إضافة حساب فرعي يتبع هذا الحساب"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>حساب فرعي</span>
              </button>
            )}

            {/* Manage Permissions */}
            {(node.role === 'root' || node.username === 'root') || (isOwnerOrAdmin(node) && !isRootSession) ? (
              <span
                className="px-2.5 py-1.5 bg-paid-soft text-paid text-xs font-bold rounded-lg border border-paid-border flex items-center gap-1.5 shadow-2xs select-none"
                title={node.role === 'root' ? 'حساب الروت محمي بكامل الصلاحيات دائماً' : 'صاحب المحل محمي بكامل الصلاحيات أمام الموظفين'}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-paid shrink-0" />
                <span>كامل الصلاحيات</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleStartPermissions(node)}
                className="px-2.5 py-1.5 bg-surface hover:bg-surface-2 text-ink text-xs font-bold rounded-lg border border-line transition-colors flex items-center gap-1.5 cursor-pointer"
                title={isOwnerOrAdmin(node) ? 'تعديل وتحديد صلاحيات صاحب المحل' : 'تعديل مصفوفة الصلاحيات'}
              >
                <Shield className="w-3.5 h-3.5 text-brand" />
                <span>الصلاحيات</span>
              </button>
            )}

            {/* Switch Account / Login */}
            {!isSelf && node.isActive && (
              <button
                type="button"
                onClick={() => handleStartSwitchLogin(node)}
                className="px-2.5 py-1.5 bg-paid-soft hover:bg-paid/20 text-paid text-xs font-bold rounded-lg border border-paid-border transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title={`تسجيل الدخول والتبديل إلى حساب (${node.displayName})`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>دخول</span>
              </button>
            )}

            {/* Change Password / PIN */}
            <button
              type="button"
              onClick={() => handleStartCredentials(node)}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-2 text-ink text-xs font-bold rounded-lg border border-line transition-colors flex items-center gap-1.5 cursor-pointer"
              title="تغيير كلمة المرور أو الرقم السري (PIN)"
            >
              <Key className="w-3.5 h-3.5 text-amber-600" />
              <span>كلمة المرور</span>
            </button>

            {/* Edit Profile */}
            <button
              type="button"
              onClick={() => handleStartEdit(node)}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-2 text-ink text-xs font-bold rounded-lg border border-line transition-colors flex items-center gap-1.5 cursor-pointer"
              title="تعديل بيانات الحساب"
            >
              <Edit3 className="w-3.5 h-3.5 text-ink-muted" />
              <span>تعديل</span>
            </button>

            {/* Toggle Status (Active / Deactive) */}
            {!isOwnerOrAdmin(node) && !isSelf && (
              <button
                type="button"
                onClick={() => handleToggleStatus(node)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  node.isActive
                    ? 'bg-danger-soft hover:bg-danger/20 text-danger border-danger-border'
                    : 'bg-paid-soft hover:bg-paid/20 text-paid border-paid-border'
                }`}
                title={node.isActive ? 'تعطيل الحساب وتجميد فروعه' : 'تفعيل الحساب'}
              >
                {node.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Render Children Nodes */}
        {hasChildren && isExpanded && (
          <div className="relative border-r-2 border-line/70 pr-2 mr-4 my-1">
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const isDirty = formMode !== 'none' && formMode !== 'switchLogin' && Boolean(
    username.trim() ||
    displayName.trim() ||
    password.trim() ||
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
  });

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-dark via-brand to-paid" />

        {/* Modal Header */}
        <div className="bg-surface px-6 py-4 flex items-center justify-between border-b border-line shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center shrink-0 shadow-2xs">
              <Users className="w-5 h-5 text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-ink">إدارة حسابات الموظفين والكاشير</h2>
                {isRootSession ? (
                  <span className="bg-brand text-white text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow-2xs flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>جلسة الروت الكاملة</span>
                  </span>
                ) : (
                  <span className="bg-brand/10 text-brand text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-brand/20">
                    صلاحيات إدارية
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted font-medium">
                إدارة حسابات الموظفين والكاشيرية، ضبط كلمات المرور والـ PIN، وتحديد الصلاحيات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Close Button */}
            <button
              type="button"
              onClick={requestClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-danger-soft border-b border-danger-border text-danger px-6 py-2.5 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-danger" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError('')} className="text-danger hover:text-ink font-bold cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="bg-paid-soft border-b border-paid-border text-paid px-6 py-2.5 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-paid" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg('')} className="text-paid hover:text-ink font-bold cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 bg-canvas overflow-y-auto flex-1 custom-scrollbar">
          {/* ======================================================== */}
          {/* 1. MAIN LIST / TREE VIEW                                 */}
          {/* ======================================================== */}
          {formMode === 'none' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 max-w-sm relative">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث بالاسم أو اسم الدخول أو الدور..."
                    className="w-full bg-surface border border-line rounded-xl pr-9 pl-3.5 py-2 text-ink text-xs focus:outline-none focus:border-brand"
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
              <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-line text-xs text-ink-muted font-bold">
                  <span>قائمة وحسابات الموظفين</span>
                  <span>{users.length} حساب مسجل</span>
                </div>

                {loading && users.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted text-xs">جاري تحميل بيانات الموظفين...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted text-xs">لا يوجد موظفون يطابقون كلمة البحث.</div>
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
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand" />
                  <h3 className="text-base font-black text-ink">إضافة حساب موظف / حساب فرعي جديد</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="text-xs text-ink-muted hover:text-ink font-bold cursor-pointer"
                >
                  الرجوع للهيكل الإداري
                </button>
              </div>

              {/* Hierarchy Parent Selection */}
              <div className="bg-surface p-4 rounded-2xl border border-line space-y-3">
                <label className="block text-xs font-bold text-ink">المشرف المباشر (الأصل في شجرة الصلاحيات)</label>
                <CustomSelect
                  value={parentId}
                  onChange={(val) => setParentId(val)}
                  options={eligibleParents}
                  placeholder="اختر المشرف المسؤول عن هذا الحساب..."
                />
                <p className="text-[11px] text-ink-muted">
                  ملاحظة معمارية هامة: الحساب الجديد لن يتمكن من امتلاك أي صلاحية لا يمتلكها المشرف المختار أعلاه.
                </p>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">اسم الموظف الكامل</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="مثال: محمد أحمد (كاشير الوردية الأولى)"
                    className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-ink text-xs focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">اسم المستخدم (للدخول السريع)</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: cashier1"
                    className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-ink text-xs font-mono focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div className="bg-surface p-4 rounded-2xl border border-line space-y-3">
                <label className="block text-xs font-bold text-ink">الدور الوظيفي</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('cashier')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      role === 'cashier'
                        ? 'bg-brand-soft border-brand ring-1 ring-brand/50'
                        : 'bg-surface border-line hover:border-brand/40'
                    }`}
                  >
                    <div className="font-bold text-ink text-xs">كاشير / نقطة البيع</div>
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      مخصص للمبيعات المباشرة وخدمة العملاء وفق الصلاحيات الممنوحة
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      role === 'admin'
                        ? 'bg-paid-soft border-paid ring-1 ring-paid/50'
                        : 'bg-surface border-line hover:border-paid/40'
                    }`}
                  >
                    <div className="font-bold text-ink text-xs">مدير فرعي / مشرف</div>
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      يمتلك صلاحيات إشرافية ورقابية موسعة على الورديات والمخزن
                    </div>
                  </button>
                </div>
              </div>

              {/* Dual Credentials: Password & PIN */}
              <div className="bg-surface p-4 rounded-2xl border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink">بيانات تسجيل الدخول (كلمة مرور أو PIN)</label>
                  <span className="text-[11px] text-ink-muted">يمكن استخدام أحدهما أو كليهما</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                      كلمة المرور (نصية - اختياري)
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-surface border border-line rounded-xl pr-3.5 pl-9 py-2 text-ink text-xs focus:outline-none focus:border-brand"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                      الرقم السري السريع (PIN: 4 - 8 أرقام)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-ink text-xs font-mono tracking-widest text-center focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                {pin && (
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">تأكيد الرقم السري (PIN)</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full max-w-xs bg-surface border border-line rounded-xl px-3.5 py-2 text-ink text-xs font-mono tracking-widest text-center focus:outline-none focus:border-brand"
                    />
                  </div>
                )}
              </div>

              {/* Delegation Authority Settings */}
              {(isRootSession || currentUser?.canDelegate) && (
                <div className="bg-surface p-4 rounded-2xl border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-ink">حق التفويض وإنشاء حسابات فرعية (Delegation)</div>
                      <div className="text-[11px] text-ink-muted">
                        السماح لهذا الموظف بإنشاء حسابات تحت إشرافه وتفويض صلاحياته لهم
                      </div>
                    </div>
                    <ToggleSwitch checked={canDelegate} onChange={(val) => setCanDelegate(val)} />
                  </div>

                  {canDelegate && (
                    <div className="pt-2 border-t border-line flex items-center gap-3">
                      <label className="text-xs font-bold text-ink whitespace-nowrap">أقصى عمق للتفريع (Max Depth):</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={maxDepth}
                        onChange={(e) => setMaxDepth(parseInt(e.target.value) || 1)}
                        className="w-20 bg-surface border border-line rounded-xl px-3 py-1.5 text-xs text-ink font-bold text-center focus:outline-none focus:border-brand"
                      />
                      <span className="text-[11px] text-ink-muted">
                        يحدد كم مستوى فرعي يمكن للحساب إنشاؤه تحت شجرته
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Permissions Matrix */}
              <div className="bg-surface p-4 rounded-2xl border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-ink">مصفوفة الصلاحيات الممنوحة</div>
                    <div className="text-[11px] text-ink-muted">
                      أي صلاحية يتم تفعيلها هنا ستظهر للموظف في واجهته، وتختفي تماماً الصلاحيات غير المحددة
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleAllPermissions(true)}
                      className="text-xs font-bold text-brand hover:underline cursor-pointer"
                    >
                      تحديد الكل المتاح
                    </button>
                    <span className="text-ink-muted">|</span>
                    <button
                      type="button"
                      onClick={() => handleToggleAllPermissions(false)}
                      className="text-xs font-bold text-danger hover:underline cursor-pointer"
                    >
                      إلغاء الكل
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {PERMISSION_GROUPS.map((group) => {
                    const availableItems = group.items.filter((item) => parentHoldsPermission(item.key));
                    const allChecked = availableItems.length > 0 && availableItems.every((item) => !!permissionsState[item.key]);

                    return (
                      <div key={group.id} className="border border-line rounded-xl p-3 bg-canvas/40">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                          <div className="flex items-center gap-2">
                            {group.icon}
                            <span className="font-bold text-xs text-ink">{group.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleGroup(group, !allChecked)}
                            className="text-[11px] font-bold text-brand hover:underline cursor-pointer"
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
                                    ? 'bg-surface-2/40 border-line/50 opacity-40 cursor-not-allowed'
                                    : isChecked
                                    ? 'bg-brand-soft/50 border-brand/40 cursor-pointer'
                                    : 'bg-surface border-line hover:border-brand/30 cursor-pointer'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  {!allowedByParent ? (
                                    <Lock className="w-3.5 h-3.5 text-ink-muted" />
                                  ) : isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-brand" />
                                  ) : (
                                    <Square className="w-4 h-4 text-ink-muted" />
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-ink">{item.label}</span>
                                  <span className="text-[10px] text-ink-muted leading-tight">
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
                  className="px-5 py-2.5 bg-surface hover:bg-surface-2 border border-line text-ink font-bold text-xs rounded-xl transition-colors cursor-pointer"
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
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="text-base font-black text-ink">تعديل بيانات الحساب: {selectedUser.displayName}</h3>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="text-xs text-ink-muted hover:text-ink font-bold cursor-pointer"
                >
                  الرجوع للهيكل الإداري
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-muted mb-1">اسم المستخدم</label>
                <input
                  type="text"
                  disabled
                  value={username}
                  className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2.5 text-ink-muted text-xs font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">اسم الموظف الظاهر</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-ink text-xs focus:outline-none focus:border-brand"
                />
              </div>

              {selectedUser.role === 'root' ? (
                <div className="p-3 bg-brand-soft border border-brand/30 rounded-xl text-brand text-xs font-bold">
                  حساب الروت الرئيسي يتمتع بصلاحيات مطلقة ودائمة ولا يمكن تخفيض دوره أو تعطيله.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">الدور الوظيفي</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRole('cashier')}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          role === 'cashier'
                            ? 'bg-brand-soft border-brand ring-1 ring-brand/50'
                            : 'bg-surface border-line hover:border-brand/40'
                        }`}
                      >
                        <div className="font-bold text-ink text-xs">كاشير (نقطة البيع)</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('admin')}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          role === 'admin'
                            ? 'bg-paid-soft border-paid ring-1 ring-paid/50'
                            : 'bg-surface border-line hover:border-paid/40'
                        }`}
                      >
                        <div className="font-bold text-ink text-xs">ترقية إلى مدير فرعي</div>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-surface border border-line rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-ink">حساب نشط</span>
                      <span className="text-[11px] text-ink-muted">
                        عند التعطيل، يتم حظر تسجيل دخول الموظف وكافة الحسابات المتفرعة منه
                      </span>
                    </div>
                    <ToggleSwitch checked={isActive} onChange={(val) => setIsActive(val)} />
                  </div>

                  {/* Delegation toggle */}
                  <div className="bg-surface p-3.5 border border-line rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-ink">حق التفويض (إنشاء حسابات تابعة)</span>
                        <span className="text-[11px] text-ink-muted">
                          تحديد ما إذا كان هذا الموظف يستطيع إضافة موظفين تحت إشرافه
                        </span>
                      </div>
                      <ToggleSwitch checked={canDelegate} onChange={(val) => setCanDelegate(val)} />
                    </div>

                    {canDelegate && (
                      <div className="pt-2 border-t border-line flex items-center gap-3">
                        <label className="text-xs font-bold text-ink whitespace-nowrap">أقصى عمق للتفريع:</label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={maxDepth}
                          onChange={(e) => setMaxDepth(parseInt(e.target.value) || 1)}
                          className="w-16 bg-surface border border-line rounded-lg px-2 py-1 text-xs text-ink font-bold text-center focus:outline-none focus:border-brand"
                        />
                      </div>
                    )}
                  </div>
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
                  className="px-5 py-2.5 bg-surface hover:bg-surface-2 border border-line text-ink font-bold text-xs rounded-xl transition-colors cursor-pointer"
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
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-brand" />
                  <div>
                    <h3 className="text-base font-black text-ink">تعديل مصفوفة صلاحيات: {selectedUser.displayName}</h3>
                    <p className="text-[11px] text-ink-muted">
                      التحكم الدقيق في ظهور وإخفاء أقسام وميزات البرنامج لهذا الموظف
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="text-xs text-ink-muted hover:text-ink font-bold cursor-pointer"
                >
                  الرجوع للهيكل الإداري
                </button>
              </div>

              {/* Cascade Warning Alert */}
              <div className="p-3 bg-warn-soft border border-warn-border rounded-xl flex items-start gap-2.5 text-xs text-warn">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">قاعدة سحب الصلاحيات الهرمية (Cascade Revoke):</span>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    أي صلاحية يتم إلغاؤها من هذا الحساب سيتم سحبها تلقائياً وفورياً من جميع الحسابات المتفرعة منه في الشجرة.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink">مجموعات الصلاحيات:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleAllPermissions(true)}
                    className="text-xs font-bold text-brand hover:underline cursor-pointer"
                  >
                    تحديد الكل المتاح
                  </button>
                  <span className="text-ink-muted">|</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAllPermissions(false)}
                    className="text-xs font-bold text-danger hover:underline cursor-pointer"
                  >
                    إلغاء الكل
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => {
                  const availableItems = group.items.filter((item) => parentHoldsPermission(item.key));
                  const allChecked = availableItems.length > 0 && availableItems.every((item) => !!permissionsState[item.key]);

                  return (
                    <div key={group.id} className="border border-line rounded-xl p-3 bg-surface">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                        <div className="flex items-center gap-2">
                          {group.icon}
                          <span className="font-bold text-xs text-ink">{group.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleGroup(group, !allChecked)}
                          className="text-[11px] font-bold text-brand hover:underline cursor-pointer"
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
                                  ? 'bg-surface-2/40 border-line/50 opacity-40 cursor-not-allowed'
                                  : isChecked
                                  ? 'bg-brand-soft/50 border-brand/40 cursor-pointer'
                                  : 'bg-surface border-line hover:border-brand/30 cursor-pointer'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {!allowedByParent ? (
                                  <Lock className="w-3.5 h-3.5 text-ink-muted" />
                                ) : isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-brand" />
                                ) : (
                                  <Square className="w-4 h-4 text-ink-muted" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-ink">{item.label}</span>
                                <span className="text-[10px] text-ink-muted leading-tight">
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
                  className="px-5 py-2.5 bg-surface hover:bg-surface-2 border border-line text-ink font-bold text-xs rounded-xl transition-colors cursor-pointer"
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
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-600" />
                  <h3 className="text-base font-black text-ink">تغيير كلمة المرور والرمز السري (PIN): {selectedUser.displayName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="text-xs text-ink-muted hover:text-ink font-bold cursor-pointer"
                >
                  الرجوع للهيكل الإداري
                </button>
              </div>

              {/* Informative Guidance Notice */}
              <div className="bg-surface-2 p-3 rounded-xl border border-line text-xs text-ink-muted leading-relaxed">
                تُستخدم هذه النافذة لإعادة تعيين كلمة المرور أو الرمز السري (PIN) الخاص بالموظف في حال نسيانه أو الحاجة لتحديثه، دون التأثير على صلاحياته أو بياناته.
              </div>

              {/* Current Credential Prompt if editing root or admin */}
              {(selectedUser.role === 'root' || selectedUser.role === 'admin') && (
                <div className="bg-warn-soft/60 p-3 rounded-xl border border-warn-border space-y-1.5">
                  <label className="block text-xs font-bold text-warn">
                    كلمة المرور الحالية أو PIN الحالي (لتأكيد الهوية)
                  </label>
                  <input
                    type="password"
                    value={currentCredential}
                    onChange={(e) => setCurrentCredential(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-surface border border-warn rounded-xl px-3 py-2 text-ink text-xs focus:outline-none focus:border-warn font-mono"
                  />
                  <p className="text-[11px] text-warn font-medium">
                    لحماية النظام: تعديل حسابات الإدارة يتطلب تأكيد بيانات الحساب الحالية.
                  </p>
                </div>
              )}

              {/* Credential Method Switcher */}
              <div className="bg-surface-2 p-1.5 rounded-xl border border-line grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCredMethod('pin')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    credMethod === 'pin'
                      ? 'bg-surface text-brand shadow-xs border border-brand/20'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Key className="w-4 h-4 text-amber-600" />
                  <span>رقم سري (PIN أرقام) — للكاشير</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCredMethod('password')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    credMethod === 'password'
                      ? 'bg-surface text-brand shadow-xs border border-brand/20'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Lock className="w-4 h-4 text-brand" />
                  <span>كلمة مرور نصية — للإدارة</span>
                </button>
              </div>

              {/* PIN Method Panel */}
              {credMethod === 'pin' && (
                <div className="bg-surface p-4 rounded-xl border border-line space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-ink">الرقم السري السريع (PIN: 4 - 8 أرقام)</label>
                      <span className="text-[11px] text-paid font-medium">موصى به لنقاط البيع وشاشات اللمس</span>
                    </div>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      autoFocus
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-ink text-sm font-mono tracking-widest text-center focus:outline-none focus:border-brand"
                    />
                    <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">
                      أرقام سريعة تسهّل على الكاشير تسجيل الدخول السريع ولمس الشاشة بدون كيبورد.
                    </p>
                  </div>

                  {pin && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted mb-1">تأكيد الرقم السري الجديد</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-ink text-sm font-mono tracking-widest text-center focus:outline-none focus:border-brand"
                      />
                    </div>
                  )}

                  {password && (
                    <div className="p-2 bg-brand-soft/30 rounded-lg text-[11px] text-brand border border-brand/20 flex items-center justify-between">
                      <span>كلمة المرور النصية المضبوطة مسبقاً: مفعّلة</span>
                      <button
                        type="button"
                        onClick={() => setPassword('')}
                        className="text-danger hover:underline font-bold cursor-pointer"
                      >
                        إلغاء النصية والاعتماد على الـ PIN فقط
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Password Method Panel */}
              {credMethod === 'password' && (
                <div className="bg-surface p-4 rounded-xl border border-line space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-ink">تعيين كلمة مرور جديدة</label>
                    <span className="text-[11px] text-brand font-medium">لحسابات الإدارة والكيبورد الكامل</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="اكتب كلمة مرور جديدة (أحرف أو أرقام)"
                      className="w-full bg-surface border border-line rounded-xl pr-3.5 pl-9 py-2 text-ink text-xs focus:outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    تتيح تسجيل الدخول بكتابة الحروف والأرقام عبر الكيبورد وتوفر حماية قوية لحساب المدير.
                  </p>

                  {pin && (
                    <div className="p-2 bg-brand-soft/30 rounded-lg text-[11px] text-brand border border-brand/20 flex items-center justify-between mt-2">
                      <span>رقم الـ PIN السريع المضبوط مسبقاً: مفعّل</span>
                      <button
                        type="button"
                        onClick={() => { setPin(''); setConfirmPin(''); }}
                        className="text-danger hover:underline font-bold cursor-pointer"
                      >
                        إلغاء الـ PIN والاعتماد على النصية فقط
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Summary note */}
              <div className="p-2.5 bg-surface-2 rounded-xl border border-line text-[11px] text-ink-muted flex items-center justify-between">
                <span>وسيلة الدخول النشطة:</span>
                <span className="font-bold text-brand">
                  {pin && password ? 'كلاهما (PIN أرقام + كلمة مرور نصية)' : pin ? 'الرقم السري (PIN) فقط' : password ? 'كلمة المرور النصية فقط' : 'لم يتم تحديد وسيلة جديدة بعد'}
                </span>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {loading ? 'جاري الحفظ...' : 'حفظ وتحديث كلمة المرور'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface hover:bg-surface-2 border border-line text-ink font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* 6. SWITCH ACCOUNT / LOGIN AS USER                        */}
          {/* ======================================================== */}
          {formMode === 'switchLogin' && selectedUser && (
            <form onSubmit={handleSubmitSwitchLogin} className="max-w-md mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <LogIn className="w-5 h-5 text-paid" />
                  <h3 className="text-base font-black text-ink">تسجيل الدخول كـ: {selectedUser.displayName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="text-xs text-ink-muted hover:text-ink font-bold cursor-pointer"
                >
                  الرجوع للهيكل الإداري
                </button>
              </div>

              {/* Account Card Preview */}
              <div className="p-3.5 bg-paid-soft/40 border border-paid-border rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-paid text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {selectedUser.role === 'root' ? <ShieldCheck className="w-5 h-5" /> : selectedUser.displayName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-ink">{selectedUser.displayName}</div>
                  <div className="text-xs text-ink-muted font-mono dir-ltr text-right">@{selectedUser.username}</div>
                </div>
                {renderRoleBadge(selectedUser)}
              </div>

              {/* Instructions */}
              <p className="text-xs text-ink-muted leading-relaxed">
                يرجى إدخال الرقم السري (PIN) أو كلمة المرور الخاصة بهذا الحساب للتحقق والتبديل الفوري للجلسة.
              </p>

              {/* PIN / Password Input */}
              <div className="bg-surface p-4 rounded-xl border border-line space-y-2">
                <label className="block text-xs font-bold text-ink">الرقم السري (PIN) أو كلمة المرور</label>
                <div className="relative">
                  <input
                    type={showSwitchSecret ? 'text' : 'password'}
                    autoFocus
                    value={switchSecret}
                    onChange={(e) => setSwitchSecret(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-surface border border-line rounded-xl pr-3.5 pl-9 py-2.5 text-ink text-sm font-mono tracking-widest text-center focus:outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSwitchSecret(!showSwitchSecret)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {showSwitchSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={loading || !switchSecret.trim()}
                  className="flex-1 py-2.5 bg-paid hover:bg-paid-dark text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? 'جاري التحقق...' : 'تسجيل الدخول فوراً والتبديل'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="px-5 py-2.5 bg-surface hover:bg-surface-2 border border-line text-ink font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface-2 border-t border-line flex items-center justify-between text-xs text-ink-muted shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <span>نظام أمان وحماية الحسابات — تشفير محلي PBKDF2</span>
          </div>
          <div className="flex items-center gap-3">
            <span>الحسابات المسجلة: {users.length}</span>
            <span>•</span>
            <span>{isRootSession ? 'جلسة الروت: يمكنك تخصيص وتعديل صلاحيات صاحب المحل' : 'حساب صاحب المحل محمي بكامل الصلاحيات'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
