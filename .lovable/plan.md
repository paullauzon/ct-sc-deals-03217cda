

The left rail aside has `overflow-y-auto` already, but looking at the screenshot and current code, the issue is likely that the parent container of the panel constrains the height in a way that breaks the scroll, OR the aside isn't getting a proper height constraint.

Let me check the LeadDetailPanel structure and the actual current LeadPanelLeftRail to verify.
