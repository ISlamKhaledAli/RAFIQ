import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppButton } from './AppButton';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-canvas flex items-center justify-center p-6 text-ink select-none" dir="rtl">
          <div className="bg-surface border hairline-all rounded-xl shadow-xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h2 className="text-lg font-bold">حدث تنبيه غير متوقع في الواجهة</h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              تم حفظ وحماية جميع البيانات في قاعدة البيانات بأمان. يمكنك إعادة تحميل الواجهة للمتابعة.
            </p>

            <AppButton variant="primary" fullWidth icon={RefreshCw} onClick={this.handleReload}>
              إعادة تشغيل وتنشيط الواجهة بأمان
            </AppButton>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
