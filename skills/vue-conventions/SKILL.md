---
name: vue-conventions
description: Use when creating, modifying, refactoring, or reviewing Vue 3, Vuetify, TypeScript, and Tailwind frontend code. Enforces SFC block layout, script splitting, script setup ordering, EasyToolTip, loading states, error handling, and styling rules.
---

# Vue 3, Vuetify & TypeScript Frontend Conventions

Strict conventions for frontend development using Vue 3 (Composition API), Vuetify, TypeScript, and Tailwind CSS. Follow these rules whenever creating, modifying, or reviewing frontend code.

---

## 1. Component Architecture & Sizing

- **Small, Focused Components**: Prefer small, focused components over monolithic ones. Break complex views into small, reusable subcomponents.
- **Dialog Decomposition (`v-dialog`)**:
  - **Never** make `v-dialog` the root element of a component.
  - Create the dialog's content as a standalone modal/card component.
  - Wrap it in `v-dialog` at the call site / parent view. This keeps the modal content independently reusable, testable, and embeddable.
- **Shared Code Extraction**:
  - Any logic, helper functions, or TypeScript interfaces used in more than one place **must** be extracted into `src/utils/` or `src/models/`.

---

## 2. Single File Component (SFC) Structure

Every Vue SFC must follow this exact top-to-bottom block order:

1. `<template>`
2. `<script>` (both static and setup scripts)
3. `<style>` (only if necessary)

### Script Tag Splitting

Separate static type declarations from reactive runtime logic using two `<script>` tags:

1. `<script lang="ts">`: Contains component-specific interfaces, types, enums, and pure constants.
2. `<script setup lang="ts">`: Contains component runtime logic and reactive state.

```vue
<template>
  <div class="flex flex-col gap-4">
    <!-- Component UI -->
  </div>
</template>

<script lang="ts">
export interface UserCardItem {
  id: string
  name: string
  role: string
}

export const DEFAULT_AVATAR_FALLBACK = '/assets/default-avatar.png'
</script>

<script setup lang="ts">
// Component runtime logic (strictly ordered)
</script>

<style scoped>
/* Only if Tailwind or Vuetify cannot express the style */
</style>
```

---

## 3. Strict `<script setup>` Internal Ordering

The contents of `<script setup lang="ts">` must follow this exact sequence, with single empty lines separating each section:

1. **Constants**: Component-local constants (timeout intervals, magic string constants, debounce delays).
   *(empty line)*
2. **`defineEmits` & `defineProps`**:
   *(empty line)*
3. **`ref`s / reactive state**:
   *(empty line)*
4. **`computed` properties**:
   *(empty line)*
5. **Functions**: const arrow functions (`const fn = () => {}`) and standard functions.
   *(empty line)*
6. **Watchers (`watch`, `watchEffect`)**:
   *(empty line)*
7. **Lifecycle hooks (`onMounted`, `onUnmounted`)**:

### Example `<script setup>` Layout

```vue
<script setup lang="ts">
const DEBOUNCE_DELAY_MS = 300
const MAX_SELECTION_COUNT = 5

// Emits & Props
// Emits: updated entity ID and selection flag
const emit = defineEmits<{
  'update': [string, boolean]
  'close': []
}>()

const props = defineProps<{
  userId: string
  initialStatus: boolean
}>()

// Refs
const isActionLoading = ref<boolean>(false)
const searchFilter = ref<string>('')

// Computed
const hasActiveFilter = computed<boolean>(() => searchFilter.value.trim().length > 0)

// Functions
const executeUserUpdate = async () => {
  isActionLoading.value = true
  try {
    // async work
    emit('update', props.userId, true)
  } catch (error: unknown) {
    handleNetworkError(error)
  } finally {
    isActionLoading.value = false
  }
}

// Watchers
watch(searchFilter, () => {
  debouncedSearch()
})

// Lifecycle
onMounted(() => {
  loadInitialData()
})
</script>
```

---

## 4. Props & Emits Rules

- **`defineEmits` Parameter Naming**:
  - In `defineEmits`, do **NOT** name tuple parameters; specify types only.
  - BAD: `'update': [userId: string, isSelected: boolean]`
  - GOOD: `'update': [string, boolean]`
  - If parameter meanings are not obvious from their types, add a descriptive comment directly above the emit declaration.

---

## 5. UI Elements & Layout Patterns

### Tooltips (`EasyToolTip`)

- **Always use `EasyToolTip`**: Never use raw `v-tooltip`.
- **Complex UI Headers & Dialogs**: Whenever presenting complex titles, modals, dialogs, or intricate configuration controls, include an `EasyToolTip` featuring an `mdi-information` icon to provide hover explanation context to the user.

### Loading States & Async Handling

- **Visual Loading Indicators**: Always indicate loading state during asynchronous operations (e.g. `:loading="isActionLoading"` on buttons, progress bars, or skeletons). Never leave users without visual feedback during network operations.
- **Debounced Loading**: Always debounce search and filter-driven loading functions. All debounce timeout values must be declared as named constants (e.g. `const SEARCH_DEBOUNCE_MS = 300`).
- **Loadable Resources**: Use generic loadable resources (built on `v-infinite-scroll`) for paginated lists, feeds, and lazy-loaded datasets.
- **Error Handling**: Always use `handleNetworkError` for catching and presenting network/API errors to users.

### Alignment & Typography

- **Centering**: Center important titles and primary action buttons.

---

## 6. Styling, Themes & CSS

- **Never Hardcode Colors**: Always use Vuetify themes (`rgb(var(--v-theme-primary))`, `text-primary`, `bg-surface`, etc.).
- **Semantic Theme Keys**:
  - Never reuse existing theme colors for differing semantic intentions.
  - If a new semantic UI state is introduced, define a new semantic theme key in the theme configuration, even if its initial hex color value matches an existing theme key.
- **No Pixel (`px`) Sizing for Layouts**:
  - Never use `px` for layout dimensions or container sizing.
  - Use flexbox (`flex`, `flex-1`, `flex-grow`, `justify-between`, `gap-*`).
  - If explicit sizing is strictly necessary, use relative viewport or font units: `vh`, `rem`, `vw`.
- **Tailwind CSS First**:
  - Prefer Tailwind CSS utility classes over scoped CSS.
  - Use scoped `<style>` only for reusable custom component classes or CSS that cannot be expressed via Tailwind / Vuetify utilities.

---

## 7. General Clean Code Standards

- **Full & Explicit Checks (No Loose Falsy Checks)**:
  - Always perform full, explicit condition checks instead of loose truthy/falsy checks.
  - **Never** write `if (!test)` or `if (test)` on objects, strings, numbers, arrays, or nullable/optional variables.
  - Fully check what you actually want to evaluate:
    - Null / Undefined: `if (test === null || test === undefined)` or `if (test !== null && test !== undefined)`
    - Empty string: `if (test === '')` or `if (test.trim().length === 0)`
    - Empty array / collection: `if (test.length === 0)`
    - Numeric check: `if (test === 0)` or `if (test < 0)`
  - **Boolean Exception**: Only when a variable is strictly of type `boolean` (`true` or `false`), you may use `if (test)` or `if (!test)`.
- **Extract Constants**: Never leave magic numbers or static string literals scattered in template or script bodies. Extract them into named constants.
- **Indicative Variable Naming**: Use clear, descriptive variable and function names (e.g., `isUserDeletionPending`, `loadUserProfileDetails`), never generic names like `data`, `item`, or `load`.
- **Minimal Docstrings**: Use docstrings very sparingly in frontend code — only when explaining complex mathematical logic or non-obvious third-party integrations. Clean, typed, well-named code is self-documenting.
