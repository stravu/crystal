import React, { useState } from 'react';
import { Cpu, Brain, Zap } from 'lucide-react';
import { TogglePill } from '../ui/Pill';
import { TogglePillImproved } from '../ui/TogglePillImproved';
import { Switch } from '../ui/Switch';
import { Card } from '../ui/Card';

export const ExtendedThinkingDemo: React.FC = () => {
  const [currentPill, setCurrentPill] = useState(false);
  const [improvedPill, setImprovedPill] = useState(false);
  const [switchState, setSwitchState] = useState(false);

  return (
    <div className="p-8 space-y-8 bg-bg-primary">
      <h1 className="text-2xl font-bold text-text-primary mb-8">
        Extended Thinking Toggle - Dark Mode UX Study
      </h1>

      {/* Current Implementation */}
      <Card variant="bordered" className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Current Implementation
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <TogglePill
            checked={currentPill}
            onCheckedChange={setCurrentPill}
            icon={<Cpu className="w-2 h-2" />}
          >
            Extended Thinking
          </TogglePill>
          <span className="text-sm text-text-tertiary">
            Current TogglePill component
          </span>
        </div>
        <div className="text-sm text-text-secondary space-y-1">
          <p>Issues in dark mode:</p>
          <ul className="list-disc list-inside text-text-tertiary">
            <li>Poor idle state affordance (looks like static text)</li>
            <li>Weak hover state (barely visible)</li>
            <li>Focus ring shows on mouse clicks</li>
            <li>Small indicator (14px)</li>
          </ul>
        </div>
      </Card>

      {/* Improved Pill Implementation */}
      <Card variant="bordered" className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Improved Pill Design
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <TogglePillImproved
            checked={improvedPill}
            onCheckedChange={setImprovedPill}
            icon={<Cpu className="w-3 h-3" />}
          >
            Extended Thinking
          </TogglePillImproved>
          <span className="text-sm text-text-tertiary">
            Improved TogglePill with better affordance
          </span>
        </div>
        <div className="text-sm text-text-secondary space-y-1">
          <p>Improvements:</p>
          <ul className="list-disc list-inside text-text-tertiary">
            <li>Clear interactive surface in idle state</li>
            <li>Visible hover with elevation and color change</li>
            <li>:focus-visible for keyboard-only focus</li>
            <li>Larger indicator (16px) with rounded square shape</li>
            <li>Smooth transitions on all states</li>
          </ul>
        </div>
      </Card>

      {/* Recommended Switch Implementation */}
      <Card variant="bordered" className="p-6 bg-interactive-surface/10">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span className="text-interactive-on-dark">✨</span>
          Recommended: Switch Component
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch
              checked={switchState}
              onCheckedChange={setSwitchState}
              label="Extended Thinking"
              icon={<Cpu />}
              size="md"
            />
            <span className="text-sm text-text-tertiary">
              Industry-standard switch pattern
            </span>
          </div>
          
          <div className="text-sm text-text-secondary space-y-1">
            <p>Benefits:</p>
            <ul className="list-disc list-inside text-text-tertiary">
              <li>Immediately recognizable as toggleable</li>
              <li>Clear on/off state with position</li>
              <li>Better accessibility (native switch semantics)</li>
              <li>Larger click target with label</li>
              <li>Smooth transitions and micro-interactions</li>
            </ul>
          </div>

          {/* Size variations */}
          <div className="mt-6 space-y-3 pt-4 border-t border-border-primary">
            <h3 className="text-sm font-medium text-text-primary">Size Variations:</h3>
            <div className="space-y-2">
              <Switch
                checked={switchState}
                onCheckedChange={setSwitchState}
                label="Small"
                icon={<Zap />}
                size="sm"
              />
              <Switch
                checked={switchState}
                onCheckedChange={setSwitchState}
                label="Medium (default)"
                icon={<Cpu />}
                size="md"
              />
              <Switch
                checked={switchState}
                onCheckedChange={setSwitchState}
                label="Large"
                icon={<Brain />}
                size="lg"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Side-by-side comparison */}
      <Card variant="bordered" className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Side-by-Side Comparison
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Current</h3>
            <TogglePill
              checked={currentPill}
              onCheckedChange={setCurrentPill}
              icon={<Cpu className="w-2 h-2" />}
            >
              Extended Thinking
            </TogglePill>
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Improved Pill</h3>
            <TogglePillImproved
              checked={improvedPill}
              onCheckedChange={setImprovedPill}
              icon={<Cpu className="w-3 h-3" />}
            >
              Extended Thinking
            </TogglePillImproved>
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Switch (Recommended)</h3>
            <Switch
              checked={switchState}
              onCheckedChange={setSwitchState}
              label="Extended Thinking"
              icon={<Cpu />}
              size="md"
            />
          </div>
        </div>
      </Card>

      {/* Interaction states preview */}
      <Card variant="bordered" className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Interaction States (Improved Pill)
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Off States</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <TogglePillImproved checked={false} onCheckedChange={() => {}}>
                  Idle
                </TogglePillImproved>
                <span className="text-xs text-text-tertiary">Default off state</span>
              </div>
              <div className="flex items-center gap-3">
                <TogglePillImproved checked={false} onCheckedChange={() => {}} disabled>
                  Disabled
                </TogglePillImproved>
                <span className="text-xs text-text-tertiary">Disabled state</span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">On States</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <TogglePillImproved checked={true} onCheckedChange={() => {}} icon={<Cpu className="w-3 h-3" />}>
                  Active
                </TogglePillImproved>
                <span className="text-xs text-text-tertiary">Active on state</span>
              </div>
              <div className="flex items-center gap-3">
                <TogglePillImproved checked={true} onCheckedChange={() => {}} disabled icon={<Cpu className="w-3 h-3" />}>
                  Disabled
                </TogglePillImproved>
                <span className="text-xs text-text-tertiary">Disabled on state</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};