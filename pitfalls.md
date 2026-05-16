# Pitfalls

## React effect deps with wrapper setters

Do not blindly add custom state setter wrappers to `useEffect` dependency arrays.

In `apps/playground-next-web`, setters returned from controller hooks such as `useChatSessionController()` are wrapper functions created during render, not stable React `useState` dispatch functions. If an effect depends on one of those wrappers and calls it inside the effect, every render can recreate the dependency, rerun the effect, call `setState`, and trigger `Maximum update depth exceeded`.

Safer options:

- Keep mount-only effects as `useEffect(..., [])` when that was the original behavior.
- Make controller-returned callbacks stable before depending on them.
- Prefer refs for values needed by long-lived event listeners.
- Be especially careful when extracting code into hooks: do not “fix” exhaustive deps by adding unstable wrapper setters unless you also stabilize them.
