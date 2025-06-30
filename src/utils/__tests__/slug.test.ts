import { describe, it, expect } from 'vitest';
import { generateSlug, ensureUniqueSlug, getAllSlugs } from '../slug';
import { createTestScreen } from '~/test-utils/screen-helpers';
import type { ScreenConfig } from '~/store/types';

describe('Slug Utilities', () => {
  describe('generateSlug', () => {
    it('should convert simple text to slug', () => {
      expect(generateSlug('Living Room')).toBe('living-room');
      expect(generateSlug('Kitchen')).toBe('kitchen');
      expect(generateSlug('Master Bedroom')).toBe('master-bedroom');
    });

    it('should handle special characters', () => {
      expect(generateSlug('Test & Demo')).toBe('test-demo');
      expect(generateSlug('Room #1')).toBe('room-1');
      expect(generateSlug('50% Off!')).toBe('50-off');
      expect(generateSlug('User\'s Room')).toBe('users-room');
    });

    it('should handle multiple spaces and trim', () => {
      expect(generateSlug('  Living   Room  ')).toBe('living-room');
      expect(generateSlug('Room    with    spaces')).toBe('room-with-spaces');
    });

    it('should handle unicode characters', () => {
      // Unicode characters are stripped by the regex
      expect(generateSlug('Café Room')).toBe('caf-room');
      expect(generateSlug('Über Cool')).toBe('ber-cool');
      expect(generateSlug('Niño\'s Room')).toBe('nios-room');
    });

    it('should handle edge cases', () => {
      expect(generateSlug('')).toBe('');
      expect(generateSlug('   ')).toBe('');
      expect(generateSlug('!!!@@##$$')).toBe('');
      expect(generateSlug('123')).toBe('123');
      expect(generateSlug('-test-')).toBe('test');
    });

    it('should handle mixed case', () => {
      expect(generateSlug('CamelCase')).toBe('camelcase');
      expect(generateSlug('UPPERCASE')).toBe('uppercase');
      expect(generateSlug('mIxEd CaSe')).toBe('mixed-case');
    });
  });

  describe('ensureUniqueSlug', () => {
    it('should return original slug if unique', () => {
      const existingSlugs = ['kitchen', 'bedroom', 'bathroom'];
      expect(ensureUniqueSlug('living-room', existingSlugs)).toBe('living-room');
    });

    it('should append number if slug exists', () => {
      const existingSlugs = ['living-room', 'kitchen', 'bedroom'];
      expect(ensureUniqueSlug('living-room', existingSlugs)).toBe('living-room-1');
    });

    it('should find next available number', () => {
      const existingSlugs = [
        'living-room',
        'living-room-1',
        'living-room-2',
        'living-room-4' // Note: 3 is missing
      ];
      expect(ensureUniqueSlug('living-room', existingSlugs)).toBe('living-room-3');
    });

    it('should handle empty slug', () => {
      const existingSlugs = ['test'];
      expect(ensureUniqueSlug('', existingSlugs)).toBe('');
    });

    it('should handle empty array', () => {
      const existingSlugs: string[] = [];
      expect(ensureUniqueSlug('living-room', existingSlugs)).toBe('living-room');
    });

    it('should handle slug with existing number suffix', () => {
      const existingSlugs = ['room-1', 'room-2'];
      expect(ensureUniqueSlug('room-1', existingSlugs)).toBe('room-1-1');
    });
  });

  describe('getAllSlugs', () => {
    it('should get slugs from flat screen list', () => {
      const screens: ScreenConfig[] = [
        createTestScreen({ slug: 'living-room' }),
        createTestScreen({ slug: 'kitchen' }),
        createTestScreen({ slug: 'bedroom' })
      ];

      const slugs = getAllSlugs(screens);
      expect(slugs).toEqual(['living-room', 'kitchen', 'bedroom']);
    });

    it('should get slugs from nested screens', () => {
      const screens: ScreenConfig[] = [
        createTestScreen({ 
          slug: 'home',
          children: [
            createTestScreen({ slug: 'living-room' }),
            createTestScreen({ 
              slug: 'upstairs',
              children: [
                createTestScreen({ slug: 'bedroom' }),
                createTestScreen({ slug: 'bathroom' })
              ]
            })
          ]
        }),
        createTestScreen({ slug: 'garage' })
      ];

      const slugs = getAllSlugs(screens);
      expect(slugs).toEqual([
        'home',
        'living-room',
        'upstairs',
        'bedroom',
        'bathroom',
        'garage'
      ]);
    });

    it('should handle empty screen list', () => {
      const slugs = getAllSlugs([]);
      expect(slugs).toEqual([]);
    });

    it('should handle screens without children', () => {
      const screens: ScreenConfig[] = [
        createTestScreen({ slug: 'screen-1', children: undefined }),
        createTestScreen({ slug: 'screen-2', children: [] })
      ];

      const slugs = getAllSlugs(screens);
      expect(slugs).toEqual(['screen-1', 'screen-2']);
    });

    it('should handle deeply nested screens', () => {
      const screens: ScreenConfig[] = [
        createTestScreen({ 
          slug: 'level-1',
          children: [
            createTestScreen({ 
              slug: 'level-2',
              children: [
                createTestScreen({ 
                  slug: 'level-3',
                  children: [
                    createTestScreen({ slug: 'level-4' })
                  ]
                })
              ]
            })
          ]
        })
      ];

      const slugs = getAllSlugs(screens);
      expect(slugs).toEqual(['level-1', 'level-2', 'level-3', 'level-4']);
    });
  });

  describe('Integration scenarios', () => {
    it('should generate unique slugs for duplicate names', () => {
      const screens: ScreenConfig[] = [
        createTestScreen({ name: 'Living Room', slug: 'living-room' }),
        createTestScreen({ name: 'Kitchen', slug: 'kitchen' })
      ];

      const existingSlugs = getAllSlugs(screens);
      
      // Try to add another "Living Room"
      const newSlug1 = generateSlug('Living Room');
      const uniqueSlug1 = ensureUniqueSlug(newSlug1, existingSlugs);
      expect(uniqueSlug1).toBe('living-room-1');

      // Add it to existing slugs
      existingSlugs.push(uniqueSlug1);

      // Try to add yet another "Living Room"
      const newSlug2 = generateSlug('Living Room');
      const uniqueSlug2 = ensureUniqueSlug(newSlug2, existingSlugs);
      expect(uniqueSlug2).toBe('living-room-2');
    });

    it('should handle special naming patterns', () => {
      const screens: ScreenConfig[] = [];
      const existingSlugs = getAllSlugs(screens);

      // Room with number
      const slug1 = generateSlug('Room 1');
      expect(slug1).toBe('room-1');
      const unique1 = ensureUniqueSlug(slug1, existingSlugs);
      expect(unique1).toBe('room-1');
      existingSlugs.push(unique1);

      // Another room with number
      const slug2 = generateSlug('Room 2');
      expect(slug2).toBe('room-2');
      const unique2 = ensureUniqueSlug(slug2, existingSlugs);
      expect(unique2).toBe('room-2');
      existingSlugs.push(unique2);

      // Duplicate of Room 1
      const slug3 = generateSlug('Room 1');
      const unique3 = ensureUniqueSlug(slug3, existingSlugs);
      expect(unique3).toBe('room-1-1');
    });
  });
});