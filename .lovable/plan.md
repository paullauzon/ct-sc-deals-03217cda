

# Inline Source Hyperlinks on Claims

## Problem

The AI already embeds inline citations like `(web search: https://example.com)` and `(website)` within the text of every field (opening hook, value angle, key insights, watch outs, discovery questions, etc.). But the UI renders these as raw text. The user wants the actual claim text to be clickable — e.g., "partnership with Shore Capital Partners" should link to the source.

The AI citation format from `enrich-lead` is: `(web search: https://...)`, `(website)`, `(form submission)`, `(notes)`. URLs appear inside parenthetical markers.

## Approach

Create a `CitedText` helper component that:
1. Parses any string for patterns like `(web search: URL)`, `(website: URL)`, or just `(URL)`
2. Turns the preceding text segment into a hyperlink pointing to that URL
3. Non-URL citations like `(website)`, `(form submission)`, `(notes)` render as small muted superscript labels (not clickable, but visible as source indicators)
4. Text without any citation renders normally

Apply `CitedText` to every rendered enrichment text field: `openingHook`, `valueAngle`, `keyInsights`, `watchOuts`, `discoveryQuestions`, `companyDossier`, `prospectProfile`, `competitivePositioning`, `decisionMakers`, `acquisitionCriteria`, `preMeetingAmmo`.

Keep the bottom source pills as-is — they serve as a summary of all sources used.

## Example Rendering

Before: `Our M&A service can position you to discover unique off-market opportunities (web search: https://bloomberg.com/article/123)`

After: "Our M&A service can position you to discover unique off-market opportunities" ← this text is a clickable blue link to bloomberg.com/article/123

For non-URL sources like `(website)`: render as a small superscript tag `[website]` in muted color.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Add `CitedText` component that parses inline `(source: URL)` patterns into hyperlinks and `(source)` patterns into superscript labels; replace all raw text renders of enrichment fields with `<CitedText text={...} />` |

