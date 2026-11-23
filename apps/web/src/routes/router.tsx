import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './require-auth'
import { RequireWorkspace } from './require-workspace'
import LoginPage from '@/pages/login'
import WorkspaceSelectPage from '@/pages/workspace-select'
import { WorkspaceLayout, DashboardPage, NotFoundPage } from '@/pages/workspace'
import { TasksPage }    from '@/pages/workspace/tasks'
import { ChatPage }     from '@/pages/workspace/chat'
import { DocsPage }     from '@/pages/workspace/docs'
import { CalendarPage } from '@/pages/workspace/calendar'
import { AIPage }       from '@/pages/workspace/ai'
import { SettingsPage } from '@/pages/workspace/settings'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/workspace/dashboard" replace /> },
  { path: 'login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: 'workspace-select', element: <WorkspaceSelectPage /> },
      {
        element: <RequireWorkspace />,
        children: [
          {
            path: 'workspace',
            element: <WorkspaceLayout />,
            children: [
              { index: true,                  element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard',            element: <DashboardPage /> },
              { path: 'tasks',                element: <TasksPage /> },
              { path: 'chat',                 element: <ChatPage /> },
              { path: 'docs',                 element: <DocsPage /> },
              { path: 'calendar',             element: <CalendarPage /> },
              { path: 'calendar/personal',    element: <CalendarPage /> },
              { path: 'calendar/team',        element: <CalendarPage /> },
              { path: 'ai',                   element: <AIPage /> },
              { path: 'settings',             element: <SettingsPage /> },
              { path: 'settings/*',           element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
