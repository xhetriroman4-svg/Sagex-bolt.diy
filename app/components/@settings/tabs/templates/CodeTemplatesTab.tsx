import React, { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';

interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  language: string;
  code: string;
  tags: string[];
  icon: string;
}

const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: 'react-component',
    name: 'React Functional Component',
    description: 'A modern React functional component with hooks',
    category: 'React',
    language: 'TypeScript',
    icon: 'i-ph:react-logo',
    tags: ['react', 'hooks', 'typescript'],
    code: `import React, { useState, useEffect } from 'react';

interface Props {
  title: string;
  initialCount?: number;
}

export const Component: React.FC<Props> = ({ title, initialCount = 0 }) => {
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Component mounted
    return () => {
      // Component unmount cleanup
    };
  }, []);

  const handleClick = () => {
    setCount(prev => prev + 1);
  };

  return (
    <div className="component-container">
      <h2>{title}</h2>
      <p>Count: {count}</p>
      <button onClick={handleClick}>
        Increment
      </button>
    </div>
  );
};

export default Component;`,
  },
  {
    id: 'api-route',
    name: 'Express API Route',
    description: 'RESTful API route with error handling',
    category: 'Backend',
    language: 'TypeScript',
    icon: 'i-ph:code',
    tags: ['express', 'api', 'rest'],
    code: `import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// GET all items
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await Item.find();
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

// GET single item
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

// POST create item
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

export default router;`,
  },
  {
    id: 'custom-hook',
    name: 'Custom React Hook',
    description: 'Reusable custom hook pattern with cleanup',
    category: 'React',
    language: 'TypeScript',
    icon: 'i-ph:hook',
    tags: ['react', 'hooks', 'custom'],
    code: `import { useState, useEffect, useCallback } from 'react';

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: () => Promise<void>;
}

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  immediate = true
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFunction();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { data, loading, error, execute };
}`,
  },
  {
    id: 'zustand-store',
    name: 'Zustand Store',
    description: 'Modern state management with Zustand',
    category: 'State',
    language: 'TypeScript',
    icon: 'i-ph:database',
    tags: ['zustand', 'state', 'store'],
    code: `import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserState {
  users: User[];
  currentUser: User | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchUsers: () => Promise<void>;
  setUser: (user: User | null) => void;
  addUser: (user: User) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  clearError: () => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set, get) => ({
        users: [],
        currentUser: null,
        isLoading: false,
        error: null,

        fetchUsers: async () => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch('/api/users');
            const users = await response.json();
            set({ users, isLoading: false });
          } catch (error) {
            set({ error: 'Failed to fetch users', isLoading: false });
          }
        },

        setUser: (user) => set({ currentUser: user }),

        addUser: (user) => set((state) => ({
          users: [...state.users, user]
        })),

        updateUser: (id, data) => set((state) => ({
          users: state.users.map((user) =>
            user.id === id ? { ...user, ...data } : user
          )
        })),

        deleteUser: (id) => set((state) => ({
          users: state.users.filter((user) => user.id !== id)
        })),

        clearError: () => set({ error: null }),
      }),
      { name: 'user-store' }
    )
  )
);`,
  },
  {
    id: 'nextjs-page',
    name: 'Next.js Page Component',
    description: 'Next.js page with SSR and SEO',
    category: 'Next.js',
    language: 'TypeScript',
    icon: 'i-ph:file-code',
    tags: ['nextjs', 'ssr', 'seo'],
    code: `import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { ReactElement } from 'react';

interface Props {
  data: {
    title: string;
    content: string;
  };
}

export default function Page({ data }: Props): ReactElement {
  return (
    <>
      <Head>
        <title>{data.title}</title>
        <meta name="description" content={data.content} />
        <meta property="og:title" content={data.title} />
        <meta property="og:description" content={data.content} />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-4">{data.title}</h1>
        <p className="text-lg text-gray-600">{data.content}</p>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  // Fetch data from API
  const response = await fetch(\`\${process.env.API_URL}/data\`);
  const data = await response.json();

  return {
    props: {
      data,
    },
  };
};`,
  },
  {
    id: 'prisma-schema',
    name: 'Prisma Schema',
    description: 'Prisma database schema template',
    category: 'Database',
    language: 'Prisma',
    icon: 'i-ph:database',
    tags: ['prisma', 'database', 'schema'],
    code: `// This is your Prisma schema file
// Learn more: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatar    String?
  role      Role     @default(USER)
  posts     Post[]
  comments  Comment[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
}

model Post {
  id          String    @id @default(cuid())
  title       String
  slug        String    @unique
  content     String
  published   Boolean   @default(false)
  author      User      @relation(fields: [authorId], references: [id])
  authorId    String
  comments    Comment[]
  tags        Tag[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([slug])
  @@index([authorId])
}

model Comment {
  id        String   @id @default(cuid())
  content   String
  post      Post     @relation(fields: [postId], references: [id])
  postId    String
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([postId])
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  posts Post[]
}

enum Role {
  USER
  ADMIN
  MODERATOR
}`,
  },
  {
    id: 'tailwind-card',
    name: 'Tailwind CSS Card',
    description: 'Beautiful card component with Tailwind',
    category: 'UI',
    language: 'TypeScript',
    icon: 'i-ph:squares-four',
    tags: ['tailwind', 'ui', 'card'],
    code: `import React from 'react';

interface CardProps {
  title: string;
  description: string;
  image?: string;
  badge?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  title,
  description,
  image,
  badge,
  onClick
}) => {
  return (
    <div
      className="group relative bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
      onClick={onClick}
    >
      {image && (
        <div className="aspect-video overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </div>
      )}
      
      {badge && (
        <span className="absolute top-4 right-4 px-3 py-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-medium rounded-full">
          {badge}
        </span>
      )}
      
      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-purple-600 transition-colors">
          {title}
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed">
          {description}
        </p>
        
        <div className="mt-4 flex items-center text-purple-600 text-sm font-medium">
          Learn more
          <svg
            className="w-4 h-4 ml-1 transform transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default Card;`,
  },
  {
    id: 'api-middleware',
    name: 'API Middleware',
    description: 'Express middleware for authentication',
    category: 'Backend',
    language: 'TypeScript',
    icon: 'i-ph:shield-check',
    tags: ['express', 'middleware', 'auth'],
    code: `import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided'
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: string;
    };
    
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

export const roleMiddleware = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Not authorized'
      });
      return;
    }

    next();
  };
};`,
  },
];

const CATEGORIES = ['All', 'React', 'Backend', 'Next.js', 'Database', 'UI', 'State'];

const TemplateCard = memo(
  ({
    template,
    onCopy,
    onPreview,
  }: {
    template: CodeTemplate;
    onCopy: (code: string) => void;
    onPreview: (template: CodeTemplate) => void;
  }) => (
    <motion.div
      layoutId={template.id}
      className={classNames(
        'group relative bg-bolt-elements-background-depth-2',
        'hover:bg-bolt-elements-background-depth-3',
        'rounded-xl overflow-hidden border border-bolt-elements-borderColor',
        'transition-all duration-200 cursor-pointer',
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={classNames(
                template.icon,
                'w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-purple-400',
              )}
            />
            <div>
              <h3 className="font-semibold text-bolt-elements-textPrimary">{template.name}</h3>
              <p className="text-xs text-bolt-elements-textTertiary">{template.language}</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-bolt-elements-textSecondary mb-4 line-clamp-2">{template.description}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {template.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-bolt-elements-background-depth-4 text-bolt-elements-textTertiary"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onCopy(template.code)}
            className="flex-1 px-3 py-2 text-sm bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <div className="i-ph:copy w-4 h-4" />
            Copy
          </button>
          <button
            onClick={() => onPreview(template)}
            className="flex-1 px-3 py-2 text-sm bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <div className="i-ph:eye w-4 h-4" />
            Preview
          </button>
        </div>
      </div>
    </motion.div>
  ),
);

const CodePreview = ({
  template,
  onClose,
  onCopy,
}: {
  template: CodeTemplate;
  onClose: () => void;
  onCopy: (code: string) => void;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="bg-bolt-elements-background-depth-1 rounded-2xl border border-bolt-elements-borderColor w-full max-w-4xl max-h-[80vh] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-4 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-3">
          <div className={classNames(template.icon, 'w-6 h-6 text-purple-400')} />
          <div>
            <h3 className="font-semibold text-bolt-elements-textPrimary">{template.name}</h3>
            <p className="text-xs text-bolt-elements-textTertiary">{template.language}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCopy(template.code)}
            className="px-4 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <div className="i-ph:copy w-4 h-4" />
            Copy Code
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bolt-elements-background-depth-3 rounded-lg transition-colors"
          >
            <div className="i-ph:x w-5 h-5 text-bolt-elements-textSecondary" />
          </button>
        </div>
      </div>

      <div className="p-4 overflow-auto max-h-[60vh]">
        <pre className="text-sm text-bolt-elements-textPrimary font-mono whitespace-pre-wrap">
          <code>{template.code}</code>
        </pre>
      </div>
    </motion.div>
  </motion.div>
);

export default function CodeTemplatesTab() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<CodeTemplate | null>(null);

  const filteredTemplates = CODE_TEMPLATES.filter((template) => {
    const matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-bolt-elements-textPrimary">Code Templates</h2>
        <p className="text-bolt-elements-textSecondary">
          Ready-to-use code snippets and patterns to accelerate your development
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-bolt-elements-textTertiary" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all',
                selectedCategory === category
                  ? 'bg-purple-500 text-white'
                  : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} onCopy={handleCopy} onPreview={setPreviewTemplate} />
          ))}
        </AnimatePresence>
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="i-ph:code-block w-16 h-16 mx-auto text-bolt-elements-textTertiary mb-4" />
          <p className="text-bolt-elements-textSecondary">No templates found matching your search</p>
        </div>
      )}

      {/* Preview Modal */}
      <AnimatePresence>
        {previewTemplate && (
          <CodePreview template={previewTemplate} onClose={() => setPreviewTemplate(null)} onCopy={handleCopy} />
        )}
      </AnimatePresence>
    </div>
  );
}
