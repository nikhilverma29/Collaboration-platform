import { projectsApi, boardsApi, tasksApi } from './tasks-api'
import { useTaskStore } from '@/stores/task-store'
import type { Column, TaskPriority, TaskStatus } from '@/types'

interface SeedTaskDef {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  tags: string[]
  daysOffset: number
  subtasks: { title: string; done?: boolean }[]
  comments: string[]
}

const PROJECT_2_NAME = 'Mobile App — v2.0 Launch'
const PROJECT_2_DESC = 'Cross-platform iOS and Android release with new onboarding and payments.'

const PROJECT_2_TASKS: SeedTaskDef[] = [
  {
    title: 'Design new onboarding splash screens',
    description: 'Create modern, engaging onboarding illustrations and motion prototypes for first-time app launches on iOS and Android.',
    status: 'IN_REVIEW',
    priority: 'HIGH',
    tags: ['Design', 'Frontend'],
    daysOffset: 5,
    subtasks: [
      { title: 'Create high-fidelity Figma mocks for screens 1–3', done: true },
      { title: 'Export vector illustrations and Lottie animations', done: false },
    ],
    comments: [
      'Figma mocks uploaded to shared folder. Reviewing typography with the design team.',
      'Looks great! Let us verify layout on smaller iPhone SE and Pixel 4a screens.',
    ],
  },
  {
    title: 'Integrate Stripe payment SDK',
    description: 'Implement end-to-end checkout with Apple Pay, Google Pay, and credit cards using Stripe mobile SDK and payment intents.',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    tags: ['Backend', 'API'],
    daysOffset: 3,
    subtasks: [
      { title: 'Configure Apple Pay and Google Pay merchant IDs', done: true },
      { title: 'Implement webhook handlers for payment intents', done: false },
    ],
    comments: [
      'Sandbox keys verified. Webhook secrets configured on staging.',
    ],
  },
  {
    title: 'Fix crash on Android 13 deep link',
    description: 'Investigate and resolve FatalException crash occurring when users open referral or channel invitation deep links.',
    status: 'TODO',
    priority: 'URGENT',
    tags: ['Bug', 'Frontend'],
    daysOffset: 2,
    subtasks: [
      { title: 'Reproduce crash stack trace on Pixel 7 emulator', done: false },
      { title: 'Update intent-filter verification in AndroidManifest', done: false },
    ],
    comments: [
      'Crash is triggered when invitation link contains encoded URL parameters.',
    ],
  },
  {
    title: 'Write unit tests for auth flow',
    description: 'Comprehensive test coverage for JWT refresh token rotation, session expiry, and sign-out cleanup.',
    status: 'TODO',
    priority: 'MEDIUM',
    tags: ['Backend'],
    daysOffset: 7,
    subtasks: [
      { title: 'Cover token refresh and expiration edge cases', done: false },
      { title: 'Mock Supabase authentication provider responses', done: false },
    ],
    comments: [
      'Targeting 85% branch coverage across all authentication controllers.',
    ],
  },
  {
    title: 'Implement biometric login',
    description: 'Allow users to authenticate with TouchID, FaceID, or Android BiometricPrompt for fast re-entry.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    tags: ['Frontend', 'Feature'],
    daysOffset: 6,
    subtasks: [
      { title: 'Add Face ID / Touch ID permission prompts', done: true },
      { title: 'Securely store refresh token in iOS Keychain and Android Keystore', done: false },
    ],
    comments: [
      'Tested FaceID on iOS 17 device. Need to verify fingerprint fallback on Samsung Galaxy.',
    ],
  },
  {
    title: 'App Store metadata and screenshots',
    description: 'Prepare localized App Store product page assets, keywords, promotional text, and iPad/tablet screenshots.',
    status: 'TODO',
    priority: 'LOW',
    tags: ['Design', 'Documentation'],
    daysOffset: 14,
    subtasks: [
      { title: 'Generate 6.7 inch and 5.5 inch device screenshot frames', done: false },
      { title: 'Translate release notes to Spanish, French, and German', done: false },
    ],
    comments: [
      'Marketing team is drafting the punchy one-line value props.',
    ],
  },
  {
    title: 'Performance audit — startup time',
    description: 'Profile JavaScript bundle execution time and reduce TTI (time to interactive) below 1.5 seconds on cold launch.',
    status: 'IN_REVIEW',
    priority: 'MEDIUM',
    tags: ['Backend', 'Frontend'],
    daysOffset: 4,
    subtasks: [
      { title: 'Profile bundle initialization with performance monitor', done: true },
      { title: 'Lazy-load secondary tab icons and assets', done: true },
    ],
    comments: [
      'Reduced cold boot time from 2.4s to 1.1s. Profiling reports attached.',
    ],
  },
]

const PROJECT_3_NAME = 'Internal DevOps Infra'
const PROJECT_3_DESC = 'CI/CD pipeline modernization, monitoring, and cloud cost optimization.'

const PROJECT_3_TASKS: SeedTaskDef[] = [
  {
    title: 'Migrate CI to GitHub Actions',
    description: 'Transition from legacy Jenkins pipeline to unified GitHub Actions workflows with caching and parallelized test matrices.',
    status: 'DONE',
    priority: 'HIGH',
    tags: ['Backend', 'API'],
    daysOffset: -2,
    subtasks: [
      { title: 'Convert Jenkins pipelines to reusable GHA workflows', done: true },
      { title: 'Set up self-hosted runner pool with auto-scaling', done: true },
    ],
    comments: [
      'Migration complete. Build times dropped from 18 minutes to 6 minutes.',
    ],
  },
  {
    title: 'Set up Datadog APM dashboards',
    description: 'Instrument microservices with dd-trace to monitor HTTP latency, database query bottlenecks, and distributed traces.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    tags: ['Backend'],
    daysOffset: 5,
    subtasks: [
      { title: 'Instrument Express middleware with dd-trace', done: true },
      { title: 'Configure P95 latency alerts for API routes', done: false },
    ],
    comments: [
      'APM traces are flowing into Datadog staging. Calibrating anomaly detection.',
    ],
  },
  {
    title: 'Reduce AWS costs by 20%',
    description: 'Audit cloud infrastructure for orphaned EBS volumes, idle NAT gateways, and unreserved EC2 instances.',
    status: 'TODO',
    priority: 'MEDIUM',
    tags: ['Backend'],
    daysOffset: 21,
    subtasks: [
      { title: 'Audit unused EBS snapshots and unattached elastic IPs', done: false },
      { title: 'Purchase 1-year Compute Savings Plans for production clusters', done: false },
    ],
    comments: [
      'Initial CloudWatch cost explorer estimate shows ~$1,400/month potential savings.',
    ],
  },
  {
    title: 'Implement zero-downtime deploys',
    description: 'Set up canary deployments and blue-green target groups behind AWS Application Load Balancer.',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    tags: ['Backend', 'API'],
    daysOffset: 4,
    subtasks: [
      { title: 'Configure blue-green ALB target group switching', done: true },
      { title: 'Verify Prisma database migrations are backwards-compatible', done: false },
    ],
    comments: [
      'Testing connection draining duration during active WebSocket sessions.',
    ],
  },
  {
    title: 'Write runbook for incident response',
    description: 'Create standard operating procedures for outage escalation, status page updates, and post-mortem reviews.',
    status: 'TODO',
    priority: 'LOW',
    tags: ['Documentation'],
    daysOffset: 10,
    subtasks: [
      { title: 'Draft severity level definitions (P0–P3)', done: false },
      { title: 'Document PagerDuty escalation policies and on-call rotations', done: false },
    ],
    comments: [
      'Reviewing draft with SRE team.',
    ],
  },
  {
    title: 'Upgrade PostgreSQL to v16',
    description: 'Upgrade RDS PostgreSQL engine from v14 to v16 for query performance improvements and parallel subquery plans.',
    status: 'TODO',
    priority: 'HIGH',
    tags: ['Backend', 'Database'],
    daysOffset: 8,
    subtasks: [
      { title: 'Benchmark read replica failover on staging', done: false },
      { title: 'Run pg_upgrade dry-run script', done: false },
    ],
    comments: [
      'Scheduled 30-minute maintenance window for Sunday 02:00 UTC.',
    ],
  },
  {
    title: 'Audit IAM permissions',
    description: 'Enforce principle of least privilege across all AWS IAM roles, groups, and service access keys.',
    status: 'DONE',
    priority: 'MEDIUM',
    tags: ['Backend', 'Security'],
    daysOffset: -5,
    subtasks: [
      { title: 'Revoke inactive developer access keys older than 90 days', done: true },
      { title: 'Enforce MFA for all AWS console logins', done: true },
    ],
    comments: [
      'All 18 service accounts verified. MFA enforcement active across the organization.',
    ],
  },
]

function getISODate(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  d.setUTCHours(17, 0, 0, 0)
  return d.toISOString()
}

function findColumnForStatus(columns: Column[], status: TaskStatus): string {
  const match = columns.find((c) => {
    const cName = c.name.toLowerCase()
    if (status === 'TODO' && (cName.includes('to do') || cName.includes('todo') || cName.includes('backlog'))) return true
    if (status === 'IN_PROGRESS' && (cName.includes('progress') || cName.includes('doing') || cName.includes('active'))) return true
    if (status === 'IN_REVIEW' && (cName.includes('review') || cName.includes('testing') || cName.includes('qa'))) return true
    if (status === 'DONE' && (cName.includes('done') || cName.includes('complete') || cName.includes('finish'))) return true
    return false
  })
  return match?.id ?? columns[0]?.id
}

export async function runSeedData(currentUser: { id: string; displayName: string }): Promise<{
  projectsCreated: number
  tasksCreated: number
  errors: string[]
}> {
  const taskStore = useTaskStore.getState()
  const errors: string[] = []
  let projectsCreated = 0
  let tasksCreated = 0

  // 1. Fetch existing projects
  const existingProjects = await projectsApi.list().catch((err) => {
    errors.push(`Failed to list projects: ${err.message}`)
    return []
  })

  // 2. Enhance existing Project 1 ("Customer Portal Revamp") with subtasks & comments if present
  const existingP1 = existingProjects.find(
    (p) => p.name.trim().toLowerCase() === 'customer portal revamp'
  )
  if (existingP1) {
    try {
      const p1Tasks = await tasksApi.list({ projectId: existingP1.id }).catch(() => [])
      for (const t of p1Tasks) {
        const existingSubs = taskStore.getSubtasks(t.id)
        if (existingSubs.length === 0) {
          const s1 = taskStore.addSubtask(t.id, 'Review acceptance criteria and design assets')
          const s2 = taskStore.addSubtask(t.id, 'Verify automated test suite passes on staging')
          if (t.status === 'DONE') {
            taskStore.toggleSubtask(t.id, s1.id)
            taskStore.toggleSubtask(t.id, s2.id)
          } else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') {
            taskStore.toggleSubtask(t.id, s1.id)
          }
        }
        const existingComments = taskStore.getComments(t.id)
        if (existingComments.length <= 1) {
          taskStore.addComment(t.id, {
            authorId: currentUser.id,
            authorName: currentUser.displayName,
            content: 'Task created for Customer Portal Revamp release cycle.',
          })
        }
      }
    } catch (err: any) {
      errors.push(`Project 1 subtask enhancement error: ${err.message}`)
    }
  }

  // 3. Helper to seed a single project with its tasks
  const seedProjectWithTasks = async (
    projectName: string,
    projectDesc: string,
    taskDefs: SeedTaskDef[]
  ) => {
    const alreadyExists = existingProjects.some(
      (p) => p.name.trim().toLowerCase() === projectName.trim().toLowerCase()
    )

    if (alreadyExists) {
      return
    }

    try {
      // a. Create project
      const createdProj = await projectsApi.create({
        name: projectName,
        description: projectDesc,
      })
      projectsCreated++

      // b. Fetch project with boards
      const projDetail = await projectsApi.getOne(createdProj.id)
      const board = projDetail.boards?.[0]
      if (!board) {
        errors.push(`No board found for project ${projectName}`)
        return
      }

      // c. Fetch columns
      let columns = board.columns
      if (!columns || columns.length === 0) {
        columns = await boardsApi.listColumns(board.id)
      }

      if (!columns || columns.length === 0) {
        errors.push(`No columns found for board ${board.id}`)
        return
      }

      // d. Create tasks
      for (const taskDef of taskDefs) {
        try {
          const columnId = findColumnForStatus(columns, taskDef.status)
          const createdTask = await tasksApi.create({
            projectId: createdProj.id,
            columnId,
            title: taskDef.title,
            description: taskDef.description,
            priority: taskDef.priority,
            status: taskDef.status,
            labels: JSON.stringify(taskDef.tags),
            dueDate: getISODate(taskDef.daysOffset),
          })
          tasksCreated++

          // Add subtasks
          for (const sub of taskDef.subtasks) {
            const createdSub = taskStore.addSubtask(createdTask.id, sub.title)
            if (sub.done) {
              taskStore.toggleSubtask(createdTask.id, createdSub.id)
            }
          }

          // Add comments
          for (const commentText of taskDef.comments) {
            taskStore.addComment(createdTask.id, {
              authorId: currentUser.id,
              authorName: currentUser.displayName,
              content: commentText,
            })
          }
        } catch (taskErr: any) {
          errors.push(`Error creating task "${taskDef.title}": ${taskErr.message}`)
        }
      }
    } catch (projErr: any) {
      errors.push(`Error creating project "${projectName}": ${projErr.message}`)
    }
  }

  // 4. Seed Project 2
  await seedProjectWithTasks(PROJECT_2_NAME, PROJECT_2_DESC, PROJECT_2_TASKS)

  // 5. Seed Project 3
  await seedProjectWithTasks(PROJECT_3_NAME, PROJECT_3_DESC, PROJECT_3_TASKS)

  return {
    projectsCreated,
    tasksCreated,
    errors,
  }
}
