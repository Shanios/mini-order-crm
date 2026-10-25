import { createBrowserRouter } from 'react-router';
import { RootLayout } from './routes/root-layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './routes/login-page';
import { OverviewPage } from './routes/overview-page';
import { OrdersListPage } from './routes/orders-list-page';
import { OrderDetailPage } from './routes/order-detail-page';
import { OrderCreatePage } from './routes/order-create-page';
import { IntegrationPage } from './routes/integration-page';
import { NotFoundPage } from './routes/not-found-page';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { path: 'login', Component: LoginPage },
      {
        Component: ProtectedRoute,
        children: [
          {
            Component: AppLayout,
            children: [
              { index: true, Component: OverviewPage },
              { path: 'orders', Component: OrdersListPage },
              { path: 'orders/new', Component: OrderCreatePage },
              { path: 'orders/:id', Component: OrderDetailPage },
              { path: 'settings/integration', Component: IntegrationPage },
              { path: '*', Component: NotFoundPage },
            ],
          },
        ],
      },
    ],
  },
]);
