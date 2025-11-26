import React from 'react';
import { BarChart3 } from 'lucide-react';
import crystalLogo from '../assets/crystal-logo.svg';
import { Modal, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { useConfigStore } from '../stores/configStore';
import { analyticsService } from '../services/analyticsService';

interface AnalyticsConsentDialogProps {
  isOpen: boolean;
  onClose: (accepted: boolean) => void;
}

export default function AnalyticsConsentDialog({ isOpen, onClose }: AnalyticsConsentDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { config, updateConfig } = useConfigStore();

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      // Enable analytics
      await updateConfig({
        analytics: {
          ...config?.analytics,
          enabled: true,
        },
      });

      // Track opt-in event
      await analyticsService.trackAnalyticsOptedIn();

      // Mark consent as shown
      if (window.electron?.invoke) {
        await window.electron.invoke('preferences:set', 'analytics_consent_shown', 'true');
      }

      onClose(true);
    } catch (error) {
      console.error('[AnalyticsConsent] Error accepting analytics:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    try {
      // Track opt-out event FIRST (before disabling analytics)
      // This uses a special minimal tracking that works even when analytics is being disabled
      await analyticsService.trackAnalyticsOptedOut();

      // Disable analytics (keep it disabled since it's opt-in)
      await updateConfig({
        analytics: {
          ...config?.analytics,
          enabled: false,
        },
      });

      // Mark consent as shown
      if (window.electron?.invoke) {
        await window.electron.invoke('preferences:set', 'analytics_consent_shown', 'true');
      }

      onClose(false);
    } catch (error) {
      console.error('[AnalyticsConsent] Error declining analytics:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={() => {}} size="md" closeOnOverlayClick={false} closeOnEscape={false} showCloseButton={false}>
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-interactive to-interactive-active p-6 text-on-interactive rounded-t-lg">
        <div className="flex items-center">
          <img src={crystalLogo} alt="Crystal" className="h-10 w-10 mr-3" />
          <h1 className="text-2xl font-bold">Help Improve Crystal</h1>
        </div>
      </div>

      <ModalBody>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-6 w-6 text-interactive flex-shrink-0 mt-0.5" />
            <div className="space-y-3">
              <p className="text-text-primary">
                We do not collect any code, prompts, or identifying information.
              </p>
              <p className="text-text-secondary">
                Your data helps us make Crystal better. You can change this anytime in Settings.
              </p>
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center">
        <Button
          onClick={handleDecline}
          variant="ghost"
          disabled={isSubmitting}
        >
          No thanks
        </Button>
        <Button
          onClick={handleAccept}
          variant="primary"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          Enable analytics
        </Button>
      </ModalFooter>
    </Modal>
  );
}
