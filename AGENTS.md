# AGENTS.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue. Always ask the developer before modifying this file.

- No `any` types - Do not use `any` or `as any` casting
- Avoid using `as` for type assertions, instead use more specific types or interfaces to ensure type safety.
- Don't run type-check or tests until the work is complete first, also verify with the dev that work is complete and to run those.
- Client-side API requests should go through Vue Query (`useQuery`, `useMutation`, or `queryClient` query helpers) rather than ad hoc component-level `fetch` calls. If a request intentionally bypasses Vue Query, document why in the change.
