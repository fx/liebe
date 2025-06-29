import { Box } from '@radix-ui/themes';
import { Section } from './Section';
import { SectionConfig } from '../store/types';
import { dashboardActions, useDashboardStore } from '../store';

interface SectionGridProps {
  screenId: string;
  sections: SectionConfig[];
}

const getSectionGridWidth = (width: SectionConfig['width']): string => {
  switch (width) {
    case 'full':
      return '1 / -1';
    case 'half':
      return 'span 6';
    case 'third':
      return 'span 4';
    case 'quarter':
      return 'span 3';
    default:
      return 'span 12';
  }
};

export function SectionGrid({ screenId, sections }: SectionGridProps) {
  const mode = useDashboardStore((state) => state.mode);
  const isEditMode = mode === 'edit';

  const handleUpdateSection = (sectionId: string, updates: Partial<SectionConfig>) => {
    dashboardActions.updateSection(screenId, sectionId, updates);
  };

  const handleDeleteSection = (sectionId: string) => {
    dashboardActions.removeSection(screenId, sectionId);
  };

  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '16px',
        width: '100%',
      }}
    >
      {sortedSections.map((section) => (
        <Box
          key={section.id}
          style={{
            gridColumn: getSectionGridWidth(section.width),
          }}
        >
          <Section
            section={section}
            onUpdate={(updates) => handleUpdateSection(section.id, updates)}
            onDelete={() => handleDeleteSection(section.id)}
          >
            {/* Entity items will go here */}
            {section.items.length > 0 && (
              <Box>
                {/* Placeholder for entity items */}
                {section.items.map((item) => (
                  <Box key={item.id} p="2" style={{ background: 'var(--gray-a3)' }}>
                    Entity: {item.entityId}
                  </Box>
                ))}
              </Box>
            )}
          </Section>
        </Box>
      ))}
    </Box>
  );
}