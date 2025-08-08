import { http, HttpResponse } from 'msw';
import { mockChecks } from '../mockData/checksData';
import { mockCSIs } from '../../../data/mockCSIData';
import { groupTagsByPrefix, TAG_CATEGORIES } from '../../../utils/tagUtils';

export const tagsHandlers = [
  // Get all available tags
  http.get('/api/tags', ({ request }) => {
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csi');

    // Simulate network delay
    return new Promise((resolve) => {
      setTimeout(() => {
        const allTags = new Set<string>();

        if (csiId) {
          // Get tags from checks associated with the selected CSI
          const csiChecks = mockChecks.filter(check => check.csiId === csiId);
          csiChecks.forEach(check => {
            check.tags.forEach(tag => allTags.add(tag));
          });

          // Also get tags from the CSI itself
          const csi = mockCSIs.find(c => c.id === csiId);
          if (csi) {
            csi.tags.forEach(tag => allTags.add(tag));
          }
        } else {
          // Get all available tags from all checks and CSIs
          mockChecks.forEach(check => {
            check.tags.forEach(tag => allTags.add(tag));
          });
          mockCSIs.forEach(csi => {
            csi.tags.forEach(tag => allTags.add(tag));
          });
        }

        const sortedTags = Array.from(allTags).sort();
        const groupedTags = groupTagsByPrefix(sortedTags);

        resolve(HttpResponse.json({
          data: sortedTags,
          grouped: groupedTags,
          categories: TAG_CATEGORIES,
          total: sortedTags.length,
          csiId,
          timestamp: new Date().toISOString()
        }));
      }, Math.random() * 300 + 100); // 100-400ms delay
    });
  }),

  // Get tag statistics
  http.get('/api/tags/stats', ({ request }) => {
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csi');

    return new Promise((resolve) => {
      setTimeout(() => {
        const tagStats = new Map<string, number>();
        let relevantChecks = mockChecks;

        if (csiId) {
          relevantChecks = mockChecks.filter(check => check.csiId === csiId);
        }

        // Count occurrences of each tag
        relevantChecks.forEach(check => {
          check.tags.forEach(tag => {
            tagStats.set(tag, (tagStats.get(tag) || 0) + 1);
          });
        });

        // Convert to array and sort by usage count
        const sortedStats = Array.from(tagStats.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);

        resolve(HttpResponse.json({
          data: sortedStats,
          totalTags: tagStats.size,
          totalChecks: relevantChecks.length,
          csiId,
          timestamp: new Date().toISOString()
        }));
      }, Math.random() * 200 + 100);
    });
  }),

  // Get tag suggestions based on current selection
  http.post('/api/tags/suggestions', async ({ request }) => {
    const { selectedTags, csiId } = await request.json() as { 
      selectedTags: string[];
      csiId?: string;
    };

    return new Promise((resolve) => {
      setTimeout(() => {
        let relevantChecks = mockChecks;
        
        if (csiId) {
          relevantChecks = mockChecks.filter(check => check.csiId === csiId);
        }

        // Find checks that have at least one of the selected tags
        const checksWithSelectedTags = relevantChecks.filter(check =>
          selectedTags.some(selectedTag => check.tags.includes(selectedTag))
        );

        // Get all tags from these checks, excluding already selected ones
        const suggestedTags = new Set<string>();
        checksWithSelectedTags.forEach(check => {
          check.tags.forEach(tag => {
            if (!selectedTags.includes(tag)) {
              suggestedTags.add(tag);
            }
          });
        });

        // Count how often each suggested tag appears with selected tags
        const tagFrequency = new Map<string, number>();
        Array.from(suggestedTags).forEach(tag => {
          const count = checksWithSelectedTags.filter(check =>
            check.tags.includes(tag)
          ).length;
          tagFrequency.set(tag, count);
        });

        // Sort suggestions by frequency
        const sortedSuggestions = Array.from(suggestedTags)
          .sort((a, b) => (tagFrequency.get(b) || 0) - (tagFrequency.get(a) || 0))
          .slice(0, 10); // Return top 10 suggestions

        resolve(HttpResponse.json({
          data: sortedSuggestions,
          selectedTags,
          csiId,
          timestamp: new Date().toISOString()
        }));
      }, Math.random() * 200 + 150);
    });
  })
];