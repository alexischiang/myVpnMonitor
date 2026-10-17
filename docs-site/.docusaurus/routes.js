import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/docs/',
    component: ComponentCreator('/docs/', '611'),
    routes: [
      {
        path: '/docs/',
        component: ComponentCreator('/docs/', '958'),
        routes: [
          {
            path: '/docs/',
            component: ComponentCreator('/docs/', 'ef9'),
            routes: [
              {
                path: '/docs/category/使用教程/',
                component: ComponentCreator('/docs/category/使用教程/', '07a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/tutorials/and-flclash-tutorial/',
                component: ComponentCreator('/docs/tutorials/and-flclash-tutorial/', '30a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/tutorials/clash-verge-tutorial/',
                component: ComponentCreator('/docs/tutorials/clash-verge-tutorial/', 'd5f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/tutorials/ios-nextin-tutorial/',
                component: ComponentCreator('/docs/tutorials/ios-nextin-tutorial/', '27b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/tutorials/shadowrocket-tutorial/',
                component: ComponentCreator('/docs/tutorials/shadowrocket-tutorial/', '98a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/',
                component: ComponentCreator('/docs/', 'ec3'),
                exact: true,
                sidebar: "docsSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
