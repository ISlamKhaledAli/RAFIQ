import type { ComponentType } from 'react';
import { Database, Receipt, ScanBarcode, ShieldAlert, SlidersHorizontal, Wrench } from 'lucide-react';
import type { RootSubTab } from '../../utils/rootAccess';

export interface RootSubTabMeta {
  /** Sidebar label */
  navLabel: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
}

/** Labels and icons of the root console pages, shared by the sidebar and the console header. */
export const ROOT_SUB_TAB_META: Record<RootSubTab, RootSubTabMeta> = {
  status: {
    navLabel: 'حالة النظام والتشخيص',
    title: 'حالة النظام والتشخيص',
    subtitle: 'ملخص حي لحالة الجهاز، وفحوصات سريعة، وفحص جاهزية التشغيل، وتجهيز ملف التشخيص',
    icon: Wrench,
  },
  receipt: {
    navLabel: 'هوية وتوقيع الإيصال',
    title: 'هوية وتوقيع الإيصال',
    subtitle: 'توقيع المطور أسفل الوصل: النص وإظهاره ومعرض الصور، مع معاينة مباشرة',
    icon: Receipt,
  },
  features: {
    navLabel: 'الميزات والأنشطة',
    title: 'الميزات والأنشطة',
    subtitle: 'تفعيل أو تعطيل ميزات النظام حسب نشاط المحل، وتغيير النشاط من معالج الإعداد',
    icon: SlidersHorizontal,
  },
  devices: {
    navLabel: 'الماسح والحماية (PIN)',
    title: 'الماسح والحماية بالرقم السري',
    subtitle: 'فحص قارئ الباركود وضبط الرقم السري الذي يحمي العمليات الحساسة',
    icon: ScanBarcode,
  },
  data: {
    navLabel: 'البيانات التجريبية والتصفير',
    title: 'البيانات التجريبية والتصدير والتصفير',
    subtitle: 'تدريب الكاشير ببيانات وهمية، وتصدير بيانات المحل، وإعادة ضبط المصنع',
    icon: Database,
  },
  audit: {
    navLabel: 'سجل المراقبة والأمان',
    title: 'سجل المراقبة والأمان',
    subtitle: 'سجل العمليات الحساسة وتوقيعها الرقمي',
    icon: ShieldAlert,
  },
};
