---
name: nlsw-patterns
description: Coding patterns extracted from nlsw repository - a logistics/shipping management system
version: 1.0.0
source: local-git-analysis
analyzed_commits: 15
---

# NLSW Patterns

This skill documents the coding patterns and conventions used in the NLSW logistics management system.

## Project Overview

NLSW is a full-stack logistics/shipping management system with:
- **Frontend**: Vue 3 + TypeScript + Shadcn-vue + Vite
- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Package Manager**: pnpm

## Commit Conventions

This project uses a mix of conventional commits and Chinese descriptions:

| Prefix | Usage |
|--------|-------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `refactor:` / `refacotor:` | Code refactoring |
| `优化` | Optimization (Chinese) |
| `bug fixed` | Bug fixes (informal) |

**Recommendation**: Standardize to conventional commits format:
```
feat: add vessel settlement feature
fix: correct bill calculation logic
refactor: extract excel transform utilities
```

## Code Architecture

### Frontend Structure

```
front_end/src/
├── components/           # Reusable Vue components
│   ├── ui/              # Base UI components (shadcn-vue)
│   ├── data-table/      # Table components with pagination
│   ├── global-layout/   # Layout components (BasicPage, BasicHeader)
│   └── app-sidebar/     # Navigation sidebar
├── composables/         # Vue composables (use-*.ts pattern)
│   ├── use-auth.ts      # Authentication logic
│   ├── use-axios.ts     # HTTP client wrapper
│   └── use-export.ts    # Export utilities
├── pages/               # File-based routing (unplugin-vue-router)
│   ├── bills/           # Bill management
│   ├── settle/          # Settlement pages
│   ├── reports/         # Report generation
│   └── invoices/        # Invoice management
├── services/api/        # API service layer (*.api.ts)
├── stores/              # Pinia stores
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

### Backend Structure

```
├── controllers/
│   ├── api/            # REST API controllers
│   └── *.js            # Legacy page controllers
├── models/             # Mongoose schemas
├── config/             # Configuration files
├── routes_api.js       # API route definitions
└── routes.js           # Page route definitions
```

## Naming Conventions

### Frontend

| Type | Convention | Example |
|------|------------|---------|
| Vue components | PascalCase | `BillFilter.vue`, `SettleTable.vue` |
| Composables | camelCase with `use-` prefix | `use-auth.ts`, `use-axios.ts` |
| API services | kebab-case with `.api.ts` suffix | `bill.api.ts`, `settle.api.ts` |
| Types/Interfaces | PascalCase | `Bill`, `BillCreateData` |
| Pages | kebab-case | `create-ship.vue`, `customer-revenue.vue` |

### Backend

| Type | Convention | Example |
|------|------------|---------|
| Models | PascalCase | `Bill.js`, `Invoice.js` |
| Controllers | snake_case | `bill.js`, `vessel_settle.js` |
| DB fields | snake_case | `bill_no`, `order_item_no` |

## API Patterns

### Frontend API Service Pattern

```typescript
// services/api/bill.api.ts
import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

// Interface definitions
export interface Bill {
  _id?: string
  bill_no: string
  order_no: string
  // ...
}

// API functions with typed responses
export async function getBills(params: {
  page?: number
  limit?: number
  billNo?: string
}) {
  const response = await axiosInstance.get<BillListResponse>('/bills', { params })
  return response.data
}
```

### Backend Controller Pattern

```javascript
// controllers/api/bill.js
exports.getBills = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const query = {};

    // Build query from request params
    if (req.query.billNo) {
      query.bill_no = { $regex: req.query.billNo, $options: 'i' };
    }

    const count = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .sort({ create_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: bills,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getBills error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
```

### API Response Format

```typescript
// Standard success response
{
  ok: true,
  data: [...],      // Result data
  total: 100,       // For paginated responses
  page: 1,
  totalPages: 5
}

// Standard error response
{
  ok: false,
  error: "Error message",
  response: "User-friendly message"  // Alternative field
}
```

## Vue Component Patterns

### Page Component Structure

```vue
<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { Bill } from '@/services/api/bill.api'
import { BasicPage } from '@/components/global-layout'

// State
const loading = ref(false)
const data = ref<Bill[]>([])

// Lifecycle
onMounted(() => {
  loadData()
})

// Methods
async function loadData() {
  loading.value = true
  try {
    const result = await getBills({ page: 1 })
    if (result.ok) {
      data.value = result.data
    }
  } catch (e: any) {
    toast.error('加载失败', { description: e.message })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BasicPage title="页面标题" description="页面描述">
    <template #actions>
      <!-- Action buttons -->
    </template>

    <!-- Page content -->
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
```

### Composable Pattern

```typescript
// composables/use-auth.ts
export function useAuth() {
  const router = useRouter()
  const { axiosInstance } = useAxios()
  const authStore = useAuthStore()

  const loading = ref(false)
  const error = ref<string | null>(null)

  async function login(userid: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const response = await axiosInstance.post('/login', { userid, password })
      if (response.data.ok) {
        authStore.setUser(response.data.user)
        router.push('/dashboard')
      } else {
        error.value = response.data.msg || '登录失败'
      }
    } catch (e: any) {
      error.value = e.response?.data?.msg || '网络错误'
    } finally {
      loading.value = false
    }
  }

  return { loading, error, login }
}
```

## Mongoose Model Patterns

### Schema with Hooks

```javascript
// models/Bill.js
const billSchema = new Schema({
  bill_no: String,
  status: { type: String, default: '新建' },
  status_flag: { type: Number, default: 0 },
  create_date: { type: Date, default: Date.now },
});

// Indexes for common queries
billSchema.index({ order: 1, bill_no: 1 });
billSchema.index({ billing_name: 1, create_date: -1 });

// Pre-save hook for derived fields
billSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.status_flag = mapStatusToFlag(this.status);
  }
  next();
});

// Pre-update hook for consistency
billSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  // Handle status_flag updates
  next();
});

module.exports = mongoose.model('Bill', billSchema);
```

## UI Patterns

### Form with Dialog

```vue
<UiDialog v-model:open="showDialog">
  <UiDialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
    <UiDialogHeader>
      <UiDialogTitle>标题</UiDialogTitle>
      <UiDialogDescription>描述</UiDialogDescription>
    </UiDialogHeader>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
      <div>
        <label class="text-sm font-medium">字段名</label>
        <UiInput v-model="form.field" />
      </div>
    </div>

    <UiDialogFooter>
      <UiButton variant="outline" @click="showDialog = false">取消</UiButton>
      <UiButton @click="handleSubmit">确认</UiButton>
    </UiDialogFooter>
  </UiDialogContent>
</UiDialog>
```

### Data Table with Selection

```vue
<!-- Desktop table -->
<div class="hidden lg:block border rounded-lg overflow-x-auto">
  <table class="text-sm min-w-[1024px]">
    <thead class="bg-muted/50">
      <tr>
        <th class="p-2 w-10">
          <input type="checkbox" @change="toggleSelectAll" />
        </th>
        <!-- columns -->
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in items" :key="item._id"
          class="border-t hover:bg-muted/30 cursor-pointer"
          :class="{ 'bg-primary/10': isSelected(item) }"
          @click="toggleSelect(item)">
        <!-- row content -->
      </tr>
    </tbody>
  </table>
</div>

<!-- Mobile cards -->
<div class="lg:hidden space-y-2">
  <div v-for="item in items" class="border rounded-lg p-3">
    <!-- card content -->
  </div>
</div>
```

## Testing Patterns

Tests are located in `test/` directory using Mocha:

```javascript
// test/app.js
describe('Application', function() {
  it('should pass', function() {
    // test assertions
  });
});
```

## Key Libraries

| Library | Purpose |
|---------|---------|
| `shadcn-vue` / `reka-ui` | UI component primitives |
| `@tanstack/vue-table` | Table management |
| `@tanstack/vue-query` | Server state management |
| `vee-validate` + `zod` | Form validation |
| `vue-sonner` | Toast notifications |
| `lucide-vue-next` | Icons |
| `pinia` | State management |
| `xlsx` / `exceljs` | Excel file handling |

## Bilingual Patterns

This codebase uses Chinese for:
- User-facing strings (labels, messages, statuses)
- Some commit messages
- Comments in complex business logic

Status values in Chinese:
- `新建` (New)
- `待配发` (Pending Distribution)
- `部分配发` (Partial Distribution)
- `已配发` (Distributed)
- `已结算` (Settled)
- `已开票` (Invoiced)
- `已回款` (Payment Received)

## Common Workflows

### Adding a New Page

1. Create page in `front_end/src/pages/<module>/<name>.vue`
2. Add route meta if auth required: `<route lang="yaml">meta: { auth: true }</route>`
3. Create API service in `front_end/src/services/api/<name>.api.ts`
4. Add backend controller in `controllers/api/<name>.js`
5. Register route in `routes_api.js`

### Adding a New API Endpoint

1. Add controller function in `controllers/api/*.js`
2. Register route in `routes_api.js`
3. Add typed API function in `front_end/src/services/api/*.api.ts`
4. Add TypeScript interfaces for request/response

### Database Changes

1. Update Mongoose schema in `models/*.js`
2. Add indexes for frequently queried fields
3. Add pre-save/pre-update hooks for derived fields
4. Update TypeScript interfaces in frontend

---

*Generated from git history analysis of nlsw repository*
