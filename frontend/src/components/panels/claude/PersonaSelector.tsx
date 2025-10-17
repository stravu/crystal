import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { API } from '../../../utils/api';
import { Dropdown, type DropdownItem } from '../../ui/Dropdown';
import { Pill } from '../../ui/Pill';
import type { PersonaDefinition } from '../../../types/persona';

interface PersonaSelectorProps {
  panelId?: string;
  className?: string;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({ panelId, className }) => {
  const [personas, setPersonas] = useState<PersonaDefinition[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>('default');
  const [loading, setLoading] = useState(true);

  // Load personas and current selection on mount
  useEffect(() => {
    const loadPersonas = async () => {
      if (!panelId) {
        setLoading(false);
        return;
      }

      try {
        // Load all available personas
        const response = await API.claudePanels.listPersonas();
        if (response.success && response.data) {
          setPersonas(response.data);
        }

        // Load current persona selection for this panel
        const personaResponse = await API.claudePanels.getPersona(panelId);
        if (personaResponse.success && personaResponse.data) {
          setSelectedPersona(personaResponse.data || 'default');
        }
      } catch (error) {
        console.error('Failed to load personas:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPersonas();
  }, [panelId]);

  // Handle persona change
  const handlePersonaChange = async (personaId: string) => {
    setSelectedPersona(personaId);

    // Save persona to panel settings if panelId is provided
    if (panelId) {
      try {
        await API.claudePanels.setPersona(panelId, personaId === 'default' ? '' : personaId);
      } catch (err) {
        console.error('Failed to save panel persona:', err);
      }
    }
  };

  // Build dropdown items - Default first, then personas sorted alphabetically
  const dropdownItems: DropdownItem[] = [
    {
      id: 'default',
      label: 'Default',
      description: 'Standard Claude behavior',
      icon: User,
      iconColor: 'text-text-secondary',
      onClick: () => handlePersonaChange('default'),
    },
    ...personas
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((persona) => ({
        id: persona.id,
        label: persona.name,
        description: persona.description,
        icon: User,
        iconColor: 'text-interactive',
        onClick: () => handlePersonaChange(persona.id),
      })),
  ];

  // Find current persona for display
  const currentPersona = personas.find((p) => p.id === selectedPersona);
  const displayLabel = selectedPersona === 'default' ? 'Default' : currentPersona?.name || 'Default';

  // Show loading state
  if (loading) {
    return (
      <Pill
        disabled
        icon={<User className="w-3.5 h-3.5 text-text-tertiary" />}
        className={className}
      >
        Loading...
      </Pill>
    );
  }

  // Create trigger button
  const triggerButton = (
    <Pill
      icon={<User className="w-3.5 h-3.5 text-interactive" />}
      className={className}
    >
      {displayLabel}
      <svg className="w-3.5 h-3.5 text-text-tertiary"
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </Pill>
  );

  return (
    <Dropdown
      trigger={triggerButton}
      items={dropdownItems}
      selectedId={selectedPersona}
      position="auto"
      width="md"
    />
  );
};
