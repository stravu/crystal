import { useState } from 'react';
import { Button, IconButton } from './ui/Button';
import { Card, CardHeader, CardContent, CardFooter } from './ui/Card';
import { Input, Textarea, Checkbox } from './ui/Input';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';

export function TokenTest() {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [modalSize, setModalSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold mb-6">Design Token Test Page</h1>
      
      {/* Background Colors */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Background Colors</h2>
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-bg-primary p-4 rounded border border-border-primary">
            <p className="text-text-primary">bg-primary</p>
          </div>
          <div className="bg-bg-secondary p-4 rounded border border-border-primary">
            <p className="text-text-primary">bg-secondary</p>
          </div>
          <div className="bg-bg-tertiary p-4 rounded border border-border-primary">
            <p className="text-text-primary">bg-tertiary</p>
          </div>
          <div className="bg-surface-primary p-4 rounded border border-border-primary">
            <p className="text-text-primary">surface-primary</p>
          </div>
          <div className="bg-surface-secondary p-4 rounded border border-border-primary">
            <p className="text-text-primary">surface-secondary</p>
          </div>
        </div>
      </section>

      {/* Text Colors */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Text Colors</h2>
        <div className="bg-surface-primary p-4 rounded space-y-2">
          <p className="text-text-primary">text-primary - Main text color</p>
          <p className="text-text-secondary">text-secondary - Secondary text</p>
          <p className="text-text-tertiary">text-tertiary - Tertiary text</p>
          <p className="text-text-muted">text-muted - Muted text</p>
          <p className="text-text-disabled">text-disabled - Disabled text</p>
        </div>
      </section>

      {/* Status Colors */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Status Colors</h2>
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-status-success p-4 rounded">
            <p className="text-white">Success</p>
          </div>
          <div className="bg-status-warning p-4 rounded">
            <p className="text-white">Warning</p>
          </div>
          <div className="bg-status-error p-4 rounded">
            <p className="text-white">Error</p>
          </div>
          <div className="bg-status-info p-4 rounded">
            <p className="text-white">Info</p>
          </div>
          <div className="bg-status-neutral p-4 rounded">
            <p className="text-white">Neutral</p>
          </div>
        </div>
      </section>

      {/* Button Component Examples */}
      <section>
        <h2 className="text-lg font-semibold mb-4">New Button Component</h2>
        <div className="space-y-4">
          {/* Variants */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-2">Variants</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" disabled>Disabled</Button>
              <Button variant="primary" loading>Loading</Button>
            </div>
          </div>
          
          {/* Sizes */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-2">Sizes</h3>
            <div className="flex items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>
          
          {/* Icon Buttons */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-2">Icon Buttons</h3>
            <div className="flex items-center gap-3">
              <IconButton 
                aria-label="Settings" 
                size="sm"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
              <IconButton 
                aria-label="Edit" 
                variant="primary"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              />
              <IconButton 
                aria-label="Delete" 
                variant="danger"
                size="lg"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* Old Button Examples for Comparison */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Old Inline Button Styles (for comparison)</h2>
        <div className="space-x-4">
          <button className="px-button-x py-button-y bg-interactive hover:bg-interactive-hover text-white rounded-button transition-colors">
            Primary Button
          </button>
          <button className="px-button-x-sm py-button-y-sm bg-surface-secondary hover:bg-surface-hover text-text-secondary rounded-button text-sm transition-colors">
            Small Button
          </button>
          <button className="px-button-x-lg py-button-y-lg bg-interactive hover:bg-interactive-hover text-white rounded-button text-lg transition-colors">
            Large Button
          </button>
        </div>
      </section>

      {/* New Card Component Examples */}
      <section>
        <h2 className="text-lg font-semibold mb-4">New Card Component</h2>
        <div className="space-y-6">
          {/* Card Variants */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Card Variants</h3>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>Default Card</CardHeader>
                <CardContent>
                  <p className="text-text-secondary">This is a default card with standard styling.</p>
                </CardContent>
              </Card>
              
              <Card variant="bordered">
                <CardHeader>Bordered Card</CardHeader>
                <CardContent>
                  <p className="text-text-secondary">This card has a visible border.</p>
                </CardContent>
              </Card>
              
              <Card variant="elevated">
                <CardHeader>Elevated Card</CardHeader>
                <CardContent>
                  <p className="text-text-secondary">This card has shadow for elevation effect.</p>
                </CardContent>
              </Card>
              
              <Card variant="interactive" onClick={() => alert('Card clicked!')}>
                <CardHeader>Interactive Card</CardHeader>
                <CardContent>
                  <p className="text-text-secondary">This card is clickable with hover effects.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Nesting Levels */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Nesting Levels</h3>
            <Card nesting="primary">
              <CardHeader>Primary Level Card</CardHeader>
              <CardContent>
                <p className="text-text-secondary mb-4">This is the primary nesting level.</p>
                <Card nesting="secondary" variant="bordered">
                  <CardHeader>Secondary Level Card</CardHeader>
                  <CardContent>
                    <p className="text-text-secondary mb-4">Nested inside primary card.</p>
                    <Card nesting="tertiary" variant="bordered">
                      <CardContent>
                        <p className="text-text-secondary">Tertiary level for deep nesting.</p>
                      </CardContent>
                    </Card>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </div>

          {/* Card with Actions */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Card with Header Actions & Footer</h3>
            <Card variant="bordered">
              <CardHeader 
                actions={
                  <>
                    <IconButton 
                      size="sm"
                      aria-label="Edit"
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      }
                    />
                    <IconButton 
                      size="sm"
                      variant="danger"
                      aria-label="Delete"
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      }
                    />
                  </>
                }
              >
                <h3 className="text-lg font-semibold">Card Title</h3>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">This card demonstrates header actions and a footer with buttons.</p>
              </CardContent>
              <CardFooter>
                <Button variant="ghost">Cancel</Button>
                <Button>Save Changes</Button>
              </CardFooter>
            </Card>
          </div>

          {/* Padding Sizes */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Padding Sizes</h3>
            <div className="grid grid-cols-3 gap-4">
              <Card padding="sm" variant="bordered">
                <p className="font-medium">Small Padding</p>
                <p className="text-text-secondary text-sm">Compact spacing</p>
              </Card>
              <Card padding="md" variant="bordered">
                <p className="font-medium">Medium Padding</p>
                <p className="text-text-secondary text-sm">Default spacing</p>
              </Card>
              <Card padding="lg" variant="bordered">
                <p className="font-medium">Large Padding</p>
                <p className="text-text-secondary text-sm">Spacious layout</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Old Card Examples for Comparison */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Old Inline Card Styles (for comparison)</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface-primary p-card rounded-card border border-border-primary">
            <h3 className="font-semibold mb-2">Default Card</h3>
            <p className="text-text-secondary">Using surface-primary background with standard card padding</p>
          </div>
          <div className="bg-surface-secondary p-card-sm rounded-card border border-border-secondary">
            <h3 className="font-semibold mb-2">Small Card</h3>
            <p className="text-text-secondary">Using surface-secondary with small padding</p>
          </div>
          <div className="bg-bg-secondary p-card-lg rounded-card shadow-card">
            <h3 className="font-semibold mb-2">Large Card</h3>
            <p className="text-text-secondary">Using bg-secondary with large padding and shadow</p>
          </div>
        </div>
      </section>

      {/* Form Components */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Form Components</h2>
        <div className="space-y-6">
          {/* Input Examples */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Input Component</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Default Input"
                placeholder="Enter some text..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                helperText="This is helper text"
              />
              <Input 
                label="Required Input"
                placeholder="This field is required"
                required
                error={!inputValue ? "This field is required" : undefined}
              />
              <Input 
                label="Disabled Input"
                placeholder="This input is disabled"
                disabled
                value="Disabled value"
              />
              <Input 
                label="Full Width Input"
                placeholder="Takes full width"
                fullWidth
              />
            </div>
          </div>

          {/* Textarea Examples */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Textarea Component</h3>
            <div className="grid grid-cols-2 gap-4">
              <Textarea 
                label="Default Textarea"
                placeholder="Enter multiple lines..."
                rows={4}
                value={textareaValue}
                onChange={(e) => setTextareaValue(e.target.value)}
                helperText="You can resize this vertically"
              />
              <Textarea 
                label="Error State Textarea"
                placeholder="This has an error"
                rows={4}
                error="Please provide more details"
              />
            </div>
          </div>

          {/* Checkbox Examples */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Checkbox Component</h3>
            <div className="space-y-3">
              <Checkbox 
                label="Default Checkbox"
                checked={checkboxValue}
                onChange={(e) => setCheckboxValue(e.target.checked)}
              />
              <Checkbox 
                label="Disabled Checkbox"
                disabled
                checked
              />
              <Checkbox 
                label="Unchecked Disabled"
                disabled
              />
            </div>
          </div>

          {/* Form Example */}
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Complete Form Example</h3>
            <Card variant="bordered" padding="lg">
              <form className="space-y-4">
                <Input 
                  label="Email"
                  type="email"
                  placeholder="john@example.com"
                  fullWidth
                  required
                />
                <Input 
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  fullWidth
                  required
                />
                <Textarea 
                  label="Comments"
                  placeholder="Tell us what you think..."
                  rows={3}
                  fullWidth
                  helperText="Optional feedback"
                />
                <Checkbox label="Remember me" />
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="ghost">Cancel</Button>
                  <Button type="submit">Submit</Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </section>

      {/* Old Interactive Elements for Comparison */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Old Form Styles (for comparison)</h2>
        <div className="space-y-4">
          <input 
            type="text" 
            placeholder="Old input with inline styling"
            className="w-full px-input-x py-input-y bg-bg-primary border border-border-primary rounded-input focus:border-border-focus focus:ring-2 focus:ring-interactive/20 text-text-primary placeholder:text-text-muted"
          />
          <textarea 
            placeholder="Old textarea with inline styling"
            rows={3}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <label className="flex items-center space-x-2">
            <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-300">Old checkbox style</span>
          </label>
        </div>
      </section>

      {/* Modal Component */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Modal Component</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-text-muted mb-3">Modal Sizes</h3>
            <div className="flex gap-2 mb-4">
              <Button 
                size="sm" 
                variant={modalSize === 'sm' ? 'primary' : 'secondary'}
                onClick={() => setModalSize('sm')}
              >
                Small
              </Button>
              <Button 
                size="sm" 
                variant={modalSize === 'md' ? 'primary' : 'secondary'}
                onClick={() => setModalSize('md')}
              >
                Medium
              </Button>
              <Button 
                size="sm" 
                variant={modalSize === 'lg' ? 'primary' : 'secondary'}
                onClick={() => setModalSize('lg')}
              >
                Large
              </Button>
              <Button 
                size="sm" 
                variant={modalSize === 'xl' ? 'primary' : 'secondary'}
                onClick={() => setModalSize('xl')}
              >
                Extra Large
              </Button>
            </div>
            <Button onClick={() => setIsModalOpen(true)}>
              Open {modalSize} Modal
            </Button>
          </div>

          <div className="bg-surface-primary p-4 rounded-lg">
            <p className="text-text-secondary text-sm">
              The Modal component features:
            </p>
            <ul className="list-disc list-inside text-text-secondary text-sm mt-2 space-y-1">
              <li>Multiple sizes (sm, md, lg, xl, full)</li>
              <li>Escape key and overlay click to close</li>
              <li>Focus management and body scroll lock</li>
              <li>Fade-in animation</li>
              <li>Subcomponents for header, body, and footer</li>
              <li>Accessibility features (ARIA attributes)</li>
            </ul>
          </div>
        </div>

        {/* Modal Instance */}
        <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)}
          size={modalSize}
        >
          <ModalHeader>
            {modalSize.toUpperCase()} Modal Example
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-text-secondary">
                This is a {modalSize} sized modal using the new Modal component. It includes proper focus management, escape key handling, and overlay click to close.
              </p>
              <Card variant="bordered">
                <CardContent>
                  <p className="text-text-secondary">
                    You can include any content here, including other components like cards, forms, etc.
                  </p>
                </CardContent>
              </Card>
              <div className="space-y-3">
                <Input 
                  label="Example Input in Modal"
                  placeholder="Type something..."
                  fullWidth
                />
                <Textarea 
                  label="Example Textarea"
                  placeholder="More details..."
                  rows={3}
                  fullWidth
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsModalOpen(false)}>
              Save Changes
            </Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* CSS Variable Values */}
      <section>
        <h2 className="text-lg font-semibold mb-4">CSS Variable Inspector</h2>
        <div className="bg-surface-primary p-4 rounded font-mono text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-text-muted mb-2">Color Variables:</p>
              <ul className="space-y-1 text-text-secondary">
                <li>--color-bg-primary: <span className="text-text-primary">{getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary')}</span></li>
                <li>--color-text-primary: <span className="text-text-primary">{getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary')}</span></li>
                <li>--color-interactive-primary: <span className="text-text-primary">{getComputedStyle(document.documentElement).getPropertyValue('--color-interactive-primary')}</span></li>
              </ul>
            </div>
            <div>
              <p className="text-text-muted mb-2">Spacing Variables:</p>
              <ul className="space-y-1 text-text-secondary">
                <li>--button-padding-x: <span className="text-text-primary">{getComputedStyle(document.documentElement).getPropertyValue('--button-padding-x')}</span></li>
                <li>--card-padding: <span className="text-text-primary">{getComputedStyle(document.documentElement).getPropertyValue('--card-padding')}</span></li>
                <li>--space-4: <span className="text-text-primary">{getComputedStyle(document.documentElement).getPropertyValue('--space-4')}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}