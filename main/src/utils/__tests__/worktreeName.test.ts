import { describe, it, expect } from 'vitest';
import { resolveNewWorktreeName, ResolveError, ResolveResult } from '../worktreeName';

describe('resolveNewWorktreeName', () => {
  describe('Basic prefix preservation', () => {
    it('should preserve prefix for simple name input', () => {
      const result = resolveNewWorktreeName('@feature/foo', 'bar');
      expect(result).toEqual({ success: true, name: '@feature/bar' });
    });

    it('should preserve different prefix types', () => {
      const result = resolveNewWorktreeName('feature/foo', 'bar');
      expect(result).toEqual({ success: true, name: 'feature/bar' });
    });

    it('should preserve complex prefixes', () => {
      const result = resolveNewWorktreeName('@bugfix/old-name', 'new-name');
      expect(result).toEqual({ success: true, name: '@bugfix/new-name' });
    });
  });

  describe('Double-prefix prevention', () => {
    it('should prevent @feature/feature/ pattern', () => {
      const result = resolveNewWorktreeName('@feature/foo', 'feature/bar');
      expect(result).toEqual({ success: true, name: 'feature/bar' });
    });

    it('should prevent feature/feature/ pattern', () => {
      const result = resolveNewWorktreeName('feature/foo', 'feature/bar');
      expect(result).toEqual({ success: true, name: 'feature/bar' });
    });

    it('should handle @ prefix vs no @ prefix as same logical structure', () => {
      const result = resolveNewWorktreeName('@feature/old', 'feature/new');
      expect(result).toEqual({ success: true, name: 'feature/new' });
    });

    it('should handle no @ prefix vs @ prefix as same logical structure', () => {
      const result = resolveNewWorktreeName('feature/old', '@feature/new');
      expect(result).toEqual({ success: true, name: '@feature/new' });
    });
  });

  describe('Exact prefix match', () => {
    it('should return exact match as-is for @feature prefix', () => {
      const result = resolveNewWorktreeName('@feature/foo', '@feature/bar');
      expect(result).toEqual({ success: true, name: '@feature/bar' });
    });

    it('should return exact match as-is for feature prefix', () => {
      const result = resolveNewWorktreeName('feature/foo', 'feature/bar');
      expect(result).toEqual({ success: true, name: 'feature/bar' });
    });

    it('should handle exact match with complex names', () => {
      const result = resolveNewWorktreeName('@feature/old-name', '@feature/new-name-with-dashes');
      expect(result).toEqual({ success: true, name: '@feature/new-name-with-dashes' });
    });
  });

  describe('No prefix scenarios', () => {
    it('should handle simple names without prefixes', () => {
      const result = resolveNewWorktreeName('foo', 'bar');
      expect(result).toEqual({ success: true, name: 'bar' });
    });

    it('should handle user adding structure to simple current name', () => {
      const result = resolveNewWorktreeName('foo', 'feature/bar');
      expect(result).toEqual({ success: true, name: 'feature/bar' });
    });

    it('should handle both names being simple', () => {
      const result = resolveNewWorktreeName('old-name', 'new-name');
      expect(result).toEqual({ success: true, name: 'new-name' });
    });
  });

  describe('Different prefix structures', () => {
    it('should allow changing from @feature to @bugfix', () => {
      const result = resolveNewWorktreeName('@feature/foo', '@bugfix/bar');
      expect(result).toEqual({ success: true, name: '@bugfix/bar' });
    });

    it('should allow changing from feature to bugfix', () => {
      const result = resolveNewWorktreeName('feature/foo', 'bugfix/bar');
      expect(result).toEqual({ success: true, name: 'bugfix/bar' });
    });

    it('should allow changing from @feature to hotfix', () => {
      const result = resolveNewWorktreeName('@feature/foo', 'hotfix/bar');
      expect(result).toEqual({ success: true, name: 'hotfix/bar' });
    });

    it('should allow changing from feature to @hotfix', () => {
      const result = resolveNewWorktreeName('feature/foo', '@hotfix/bar');
      expect(result).toEqual({ success: true, name: '@hotfix/bar' });
    });
  });

  describe('Simple name with prefix', () => {
    it('should add @feature prefix to simple name', () => {
      const result = resolveNewWorktreeName('@feature/foo', 'bar');
      expect(result).toEqual({ success: true, name: '@feature/bar' });
    });

    it('should add feature prefix to simple name', () => {
      const result = resolveNewWorktreeName('feature/foo', 'bar');
      expect(result).toEqual({ success: true, name: 'feature/bar' });
    });

    it('should add complex prefix to simple name', () => {
      const result = resolveNewWorktreeName('@release/v1.0', 'v2.0');
      expect(result).toEqual({ success: true, name: '@release/v2.0' });
    });
  });

  describe('Error cases', () => {
    it('should reject invalid @feature/@feature/bar pattern', () => {
      // This would be caught by validation, simulating a malformed input
      const result = resolveNewWorktreeName('@feature/foo', '@feature/@feature/bar');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('duplicate parts');
      }
    });

    it('should reject feature/feature/bar pattern', () => {
      // This would be caught by validation
      const result = resolveNewWorktreeName('feature/foo', 'feature/feature/bar');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('duplicate parts');
      }
    });

    it('should reject empty current name', () => {
      const result = resolveNewWorktreeName('', 'new-name');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('required');
      }
    });

    it('should reject empty user input', () => {
      const result = resolveNewWorktreeName('current', '');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('required');
      }
    });

    it('should reject whitespace-only user input', () => {
      const result = resolveNewWorktreeName('current', '   ');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('cannot be empty');
      }
    });

    it('should reject paths with double slashes', () => {
      const result = resolveNewWorktreeName('feature/foo', 'feature//bar');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('invalid path separators');
      }
    });

    it('should reject paths starting with slash', () => {
      const result = resolveNewWorktreeName('feature/foo', '/feature/bar');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('invalid path separators');
      }
    });

    it('should reject paths ending with slash', () => {
      const result = resolveNewWorktreeName('feature/foo', 'feature/bar/');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('invalid path separators');
      }
    });
  });

  describe('Multi-level prefix scenarios', () => {
    it('should preserve full multi-level prefix for simple name input', () => {
      const result = resolveNewWorktreeName('@feature/subfolder/name', 'new-name');
      expect(result).toEqual({ success: true, name: '@feature/subfolder/new-name' });
    });

    it('should preserve multi-level prefix without @ symbol', () => {
      const result = resolveNewWorktreeName('feature/docs/api', 'endpoints');
      expect(result).toEqual({ success: true, name: 'feature/docs/endpoints' });
    });

    it('should handle user input with different multi-level structure', () => {
      const result = resolveNewWorktreeName('@feature/sub1/old', '@bugfix/sub2/new');
      expect(result).toEqual({ success: true, name: '@bugfix/sub2/new' });
    });

    it('should handle exact multi-level prefix match', () => {
      const result = resolveNewWorktreeName('@feature/subfolder/old', '@feature/subfolder/new');
      expect(result).toEqual({ success: true, name: '@feature/subfolder/new' });
    });

    it('should handle partial multi-level prefix match', () => {
      const result = resolveNewWorktreeName('@feature/sub1/old', '@feature/sub2/new');
      expect(result).toEqual({ success: true, name: '@feature/sub2/new' });
    });

    it('should preserve three-level prefix structure', () => {
      const result = resolveNewWorktreeName('@feature/docs/api/old', 'new');
      expect(result).toEqual({ success: true, name: '@feature/docs/api/new' });
    });

    it('should handle changing from multi-level to single-level with same base', () => {
      const result = resolveNewWorktreeName('@feature/subfolder/old', '@feature/new');
      expect(result).toEqual({ success: true, name: '@feature/new' });
    });
  });

  describe('Edge cases', () => {
    it('should handle malformed inputs gracefully', () => {
      const result = resolveNewWorktreeName('feature/foo', 'feature/');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result as ResolveError).error).toContain('invalid path separators');
      }
    });

    it('should handle special characters in names', () => {
      const result = resolveNewWorktreeName('@feature/foo-bar_123', 'new-name_456');
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as ResolveResult).name).toBe('@feature/new-name_456');
      }
    });

    it('should handle very long names', () => {
      const longName = 'very-very-very-long-feature-name-that-might-cause-issues';
      const result = resolveNewWorktreeName('@feature/old', longName);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as ResolveResult).name).toBe(`@feature/${longName}`);
      }
    });

    it('should trim whitespace from user input', () => {
      const result = resolveNewWorktreeName('@feature/foo', '  new-name  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as ResolveResult).name).toBe('@feature/new-name');
      }
    });

    it('should handle complex nested structures correctly', () => {
      const result = resolveNewWorktreeName('@feature/complex-name', '@bugfix/another-complex-name');
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as ResolveResult).name).toBe('@bugfix/another-complex-name');
      }
    });

    it('should handle numeric prefixes and names', () => {
      const result = resolveNewWorktreeName('v1/release', 'v2/release');
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as ResolveResult).name).toBe('v2/release');
      }
    });

    it('should handle single character names', () => {
      const result = resolveNewWorktreeName('@f/a', 'b');
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as ResolveResult).name).toBe('@f/b');
      }
    });
  });
});