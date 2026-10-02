import { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  X,
  Search,
  ShoppingCart,
  Package,
  Truck,
  Users,
  BarChart3,
  ShieldCheck,
  Headphones,
  FileQuestion,
  PhoneCall,
  Copy,
  Check,
  Keyboard,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Cpu,
  KeyRound,
  Download,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Sparkles,
  Info
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { SystemInfo } from '../App';
import type { LicenseInfoData } from './LicenseModal';

export type HelpSectionId = 
  | 'pos' 
  | 'products' 
  | 'purchases' 
  | 'customers' 
  | 'sales' 
  | 'backup_security' 
  | 'faq' 
  | 'support';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: HelpSectionId | string;
}

interface HelpGuideStep {
  title: string;
  description: string;
  shortcut?: string;
  badge?: string;
}

interface HelpArticle {
  id: string;
  sectionId: HelpSectionId;
  title: string;
  summary: string;
  keywords: string[];
  steps: HelpGuideStep[];
  goldenRule?: string;
  troubleshooting?: string;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  tag: string;
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'pos_guide',
    sectionId: 'pos',
    title: 'Ø¯Ù„ÙŠÙ„ Ø§Ù„ÙƒØ§Ø´ÙŠØ± ÙˆØ§Ù„Ø¨ÙŠØ¹ Ø§Ù„Ø³Ø±ÙŠØ¹ (POS)',
    summary: 'Ø®Ø·ÙˆØ§Øª Ø¥ØªÙ…Ø§Ù… Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø£Ùˆ Ø§Ù„Ø¨Ø­Ø«ØŒ ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ÙƒÙ…ÙŠØ§Øª ÙˆØ§Ù„Ø£Ø³Ø¹Ø§Ø±ØŒ ÙˆØªØ¹Ù„ÙŠÙ‚ ÙˆØ³Ø¯Ø§Ø¯ Ø§Ù„ÙÙˆØ§ØªÙŠØ±.',
    keywords: ['Ø¨ÙŠØ¹', 'ÙƒØ§Ø´ÙŠØ±', 'Ø¨Ø§Ø±ÙƒÙˆØ¯', 'ÙØ§ØªÙˆØ±Ø©', 'Ø¯ÙØ¹', 'Ø³Ù„Ø©', 'f9', 'f2', 'f4', 'f10', 'Ù…ÙŠØ²Ø§Ù†', 'Ù…Ø±ØªØ¬Ø¹'],
    goldenRule: 'Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ø³Ø±ÙŠØ¹ ÙŠØ¹ØªÙ…Ø¯ 100% Ø¹Ù„Ù‰ Ù„ÙˆØ­Ø© Ø§Ù„Ù…ÙØ§ØªÙŠØ­: Ø§Ø¶ØºØ· F2 Ù„Ù„Ø¨Ø­Ø« Ø§Ù„Ø³Ø±ÙŠØ¹ØŒ F4 Ù„Ù„ÙƒÙ…ÙŠØ©ØŒ Ø«Ù… F9 Ù„Ù„Ø¯ÙØ¹ ÙˆØ¥Ù†Ù‡Ø§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙÙŠ Ø«Ø§Ù†ÙŠØªÙŠÙ†.',
    steps: [
      {
        badge: '1',
        title: 'Ù…Ø³Ø­ Ø§Ù„Ø£ØµÙ†Ø§Ù Ø¨Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯',
        description: 'Ù…Ø±Ø± Ù‚Ø§Ø±Ø¦ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¹Ù„Ù‰ Ø£ÙŠ Ù…Ù†ØªØ¬ØŒ ÙˆØ³ÙŠÙØ¶Ø§Ù ÙÙˆØ±Ø§Ù‹ Ù„Ù„Ø³Ù„Ø©. Ø¥Ø°Ø§ Ù…Ø±Ø±Øª Ù†ÙØ³ Ø§Ù„ØµÙ†Ù Ù…Ø¬Ø¯Ø¯Ø§Ù‹ ØªØ²ÙŠØ¯ ÙƒÙ…ÙŠØªÙ‡ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.',
        shortcut: 'Ù‚Ø§Ø±Ø¦ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø£Ùˆ Enter'
      },
      {
        badge: '2',
        title: 'Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ø³Ø±ÙŠØ¹ Ø¹Ù† ØµÙ†Ù Ø¨Ø¯ÙˆÙ† Ø¨Ø§Ø±ÙƒÙˆØ¯',
        description: 'Ø§Ø¶ØºØ· F2 Ù„Ù„Ø¨Ø­Ø« Ø§Ù„ÙÙˆØ±ÙŠ Ø¨Ø§Ø³Ù… Ø§Ù„ØµÙ†Ù (Ù…Ø«Ù„: Ø´Ø§ÙŠØŒ Ø¬Ø¨Ù†Ø©ØŒ Ø£Ø±Ø²). Ø§Ø¶ØºØ· Ø§Ù„Ø£Ø³Ù‡Ù… Ù„Ø£Ø¹Ù„Ù‰/Ù„Ø£Ø³ÙÙ„ Ø«Ù… Enter Ù„Ø¥Ø¶Ø§ÙØªÙ‡.',
        shortcut: 'F2'
      },
      {
        badge: '3',
        title: 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ÙƒÙ…ÙŠØ© Ø£Ùˆ Ø§Ù„ÙˆØ²Ù† Ø¨Ø§Ù„Ø¬Ø±Ø§Ù…',
        description: 'Ø­Ø¯Ø¯ Ø§Ù„ØµÙ†Ù ÙÙŠ Ø§Ù„Ø³Ù„Ø© ÙˆØ§Ø¶ØºØ· F4 Ù„ØªØºÙŠÙŠØ± Ø§Ù„ÙƒÙ…ÙŠØ©. Ù„Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„ÙˆØ²Ù†ÙŠØ© (Ø¬Ø¨Ù†/Ù„Ø­ÙˆÙ…) Ø§ÙƒØªØ¨ Ø§Ù„ÙˆØ²Ù† Ø¨Ø§Ù„Ø¬Ø±Ø§Ù… Ù…Ø«Ù„ 250 Ø£Ùˆ 0.25 ÙƒØ¬Ù….',
        shortcut: 'F4'
      },
      {
        badge: '4',
        title: 'Ø±Ø¨Ø· Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ø¹Ù…ÙŠÙ„ (Ù„Ù„Ø¢Ø¬Ù„ Ø£Ùˆ Ø§Ù„Ù†Ù‚Ø§Ø·)',
        description: 'Ø§Ø¶ØºØ· F3 Ù„Ù„Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¨Ø±Ù‚Ù… Ù‡Ø§ØªÙÙ‡ Ø£Ùˆ Ø§Ø³Ù…Ù‡ Ù„Ø±Ø¨Ø· Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙˆØ­Ø³Ø§Ø¨ Ø¯ÙŠÙ†Ù‡ Ø£Ùˆ Ù…Ù†Ø­Ù‡ Ø®ØµÙ…Ø§Ù‹ Ø®Ø§ØµØ§Ù‹.',
        shortcut: 'F3'
      },
      {
        badge: '5',
        title: 'Ø¥ØªÙ…Ø§Ù… Ø§Ù„Ø¯ÙØ¹ ÙˆØ§Ù„Ø·Ø¨Ø§Ø¹Ø© (ÙƒØ§Ø´ / ÙÙŠØ²Ø§ / Ø¢Ø¬Ù„)',
        description: 'Ø§Ø¶ØºØ· F9 Ù„ÙØªØ­ Ø´Ø§Ø´Ø© Ø§Ù„Ø¯ÙØ¹ Ø§Ù„Ø³Ø±ÙŠØ¹. Ø£Ø¯Ø®Ù„ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø¯ÙÙˆØ¹ Ù„ÙŠØ­Ø³Ø¨ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø§Ù„Ø¨Ø§Ù‚ÙŠ ÙÙˆØ±Ø§Ù‹ØŒ Ø«Ù… Ø§Ø¶ØºØ· Enter Ù„Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¥ÙŠØµØ§Ù„ ÙˆÙØªØ­ Ø§Ù„Ø¯Ø±Ø¬.',
        shortcut: 'F9'
      },
      {
        badge: '6',
        title: 'ØªØ¹Ù„ÙŠÙ‚ ÙˆØ§Ø³ØªØ±Ø¬Ø§Ø¹ Ø§Ù„ÙÙˆØ§ØªÙŠØ± (Park Sale)',
        description: 'Ø¥Ø°Ø§ Ù†Ø³Ù‰ Ø§Ù„Ø²Ø¨ÙˆÙ† Ù…Ø­ÙØ¸ØªÙ‡ Ø£Ùˆ Ø°Ù‡Ø¨ Ù„Ø¥Ø­Ø¶Ø§Ø± Ø³Ù„Ø¹Ø©ØŒ Ø§Ø¶ØºØ· F10 Ù„ØªØ¹Ù„ÙŠÙ‚ Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙˆØ®Ø¯Ù…Ø© Ø§Ù„Ø²Ø¨ÙˆÙ† Ø§Ù„ØªØ§Ù„ÙŠØŒ Ø«Ù… Ø§Ø³ØªØ±Ø¬Ø¹Ù‡Ø§ Ø¨Ù†Ù‚Ø±Ø© ÙˆØ§Ø­Ø¯Ø©.',
        shortcut: 'F10'
      }
    ],
    troubleshooting: 'Ù„Ùˆ ÙƒØ§Ù† Ù‚Ø§Ø±Ø¦ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ ÙŠÙƒØªØ¨ Ø­Ø±ÙˆÙØ§ Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© Ø¹Ø´ÙˆØ§Ø¦ÙŠØ©ØŒ ØªØ£ÙƒØ¯ Ù…Ù† Ø¶Ø¨Ø· Ù„ØºØ© Ø§Ù„ÙˆÙŠÙ†Ø¯ÙˆØ² Ø£Ùˆ ØªÙØ¹ÙŠÙ„ Ù…ÙŠØ²Ø© Ø§Ù„ØªØµØ­ÙŠØ­ Ø§Ù„Ø°Ø§ØªÙŠ ÙÙŠ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…Ø§Ø³Ø­.'
  },
  {
    id: 'products_guide',
    sectionId: 'products',
    title: 'Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ† ÙˆØ§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯',
    summary: 'ÙƒÙŠÙÙŠØ© Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø£ØµÙ†Ø§ÙØŒ Ø¶Ø¨Ø· Ø£Ø³Ø¹Ø§Ø± Ø§Ù„ØªÙƒÙ„ÙØ© ÙˆØ§Ù„Ø¨ÙŠØ¹ØŒ ØªÙˆÙ„ÙŠØ¯ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¯Ø§Ø®Ù„ÙŠØŒ ÙˆÙ…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ù†ÙˆØ§Ù‚Øµ.',
    keywords: ['Ù…Ù†ØªØ¬', 'Ù…Ø®Ø²ÙˆÙ†', 'Ø¨Ø§Ø±ÙƒÙˆØ¯', 'ØªÙƒÙ„ÙØ©', 'Ø³Ø¹Ø±', 'Ù†ÙˆØ§Ù‚Øµ', 'ØªÙ†Ø¨ÙŠÙ‡', 'Ø£ÙˆØ²Ø§Ù†', 'ØµÙ„Ø§Ø­ÙŠØ©', 'ØªØ¹Ø¯ÙŠÙ„'],
    goldenRule: 'Ø§Ø¶Ø¨Ø· Ø¯Ø§Ø¦Ù…Ø§Ù‹ Ø­Ø¯ Ø§Ù„Ø·Ù„Ø¨ Ø§Ù„Ø£Ø¯Ù†Ù‰ (Min Stock) Ù„ÙƒÙ„ ØµÙ†Ù Ù„ÙŠØµÙ„Ùƒ ØªÙ†Ø¨ÙŠÙ‡ Ù…Ù„ÙˆÙ† Ù‚Ø¨Ù„ Ù†ÙØ§Ø¯ Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ù…Ù† Ø§Ù„Ø±Ù.',
    steps: [
      {
        badge: '1',
        title: 'Ø¥Ø¶Ø§ÙØ© Ù…Ù†ØªØ¬ Ø¬Ø¯ÙŠØ¯',
        description: 'Ù…Ù† ØªØ¨ÙˆÙŠØ¨ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª Ø§Ø¶ØºØ· "Ø¥Ø¶Ø§ÙØ© ØµÙ†Ù Ø¬Ø¯ÙŠØ¯"ØŒ Ø§Ù…Ø³Ø­ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ØŒ Ø§ÙƒØªØ¨ Ø§Ù„Ø§Ø³Ù…ØŒ Ø³Ø¹Ø± Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ³Ø¹Ø± Ø§Ù„ØªÙƒÙ„ÙØ©ØŒ ÙˆØ­Ø¯Ø¯ Ø§Ù„ÙˆØ­Ø¯Ø© (Ù‚Ø·Ø¹Ø© / ÙƒØ¬Ù…).',
        shortcut: 'Ctrl + N'
      },
      {
        badge: '2',
        title: 'ØªÙˆÙ„ÙŠØ¯ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¯Ø§Ø®Ù„ÙŠ Ù„Ù„Ø£ØµÙ†Ø§Ù ØºÙŠØ± Ø§Ù„Ù…ÙƒÙˆØ¯Ø©',
        description: 'Ù„Ù„Ø®Ø¶Ø±ÙˆØ§ØªØŒ Ø§Ù„Ù…Ø®Ø¨ÙˆØ²Ø§Øª Ø£Ùˆ Ø§Ù„Ø¨Ù‡Ø§Ø±Ø§Øª Ø§Ù„ØªÙŠ Ù„Ø§ ØªØ­Ù…Ù„ Ø¨Ø§Ø±ÙƒÙˆØ¯Ø§Ù‹ØŒ Ø§Ø¶ØºØ· "ØªÙˆÙ„ÙŠØ¯ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¯Ø§Ø®Ù„ÙŠ" Ù„ÙŠÙÙ†Ø´Ø¦ Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨Ø§Ø±ÙƒÙˆØ¯Ø§Ù‹ ÙØ±ÙŠØ¯Ø§Ù‹ ÙŠØ¨Ø¯Ø£ Ø¨Ù€ 200.',
        shortcut: 'ØªÙˆÙ„ÙŠØ¯ Ø¨Ø§Ø±ÙƒÙˆØ¯'
      },
      {
        badge: '3',
        title: 'Ø¬Ø±Ø¯ ÙˆØªØ¹Ø¯ÙŠÙ„ Ø±ØµÙŠØ¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†',
        description: 'Ù…Ù† Ø´Ø§Ø´Ø© "Ø­Ø±ÙƒØ§Øª ÙˆØ¬Ø±Ø¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†"ØŒ ÙŠÙ…ÙƒÙ†Ùƒ Ø¹Ù…Ù„ ØªØ³ÙˆÙŠØ© Ù…Ø®Ø²Ù†ÙŠØ© (Ø¬Ø±Ø¯ ÙØ¹Ù„ÙŠ) Ù…Ø¹ Ø°ÙƒØ± Ø³Ø¨Ø¨ Ø§Ù„ØªØ³ÙˆÙŠØ© Ù„Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ø¯Ù‚Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©.',
        shortcut: 'ØªØ³ÙˆÙŠØ© Ù…Ø®Ø²ÙˆÙ†'
      },
      {
        badge: '4',
        title: 'Ù…ØªØ§Ø¨Ø¹Ø© ØªÙˆØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© ÙˆØ§Ù„Ø¯ÙØ¹Ø§Øª',
        description: 'Ø³Ø¬Ù„ ØªØ§Ø±ÙŠØ® Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© Ù„ÙƒÙ„ Ø¯ÙØ¹Ø© ØªÙˆØ±ÙŠØ¯ Ù„ØªØ³ØªÙ‚Ø¨Ù„ ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ù…Ø¨ÙƒØ±Ø© Ù‚Ø¨Ù„ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© Ø¨Ù€ 30 Ùˆ 15 ÙŠÙˆÙ…Ø§Ù‹.',
        shortcut: 'ØªÙˆØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©'
      }
    ],
    troubleshooting: 'ÙŠÙ…Ù†Ø¹ Ø§Ù„Ù†Ø¸Ø§Ù… ØªØ®Ø²ÙŠÙ† Ù…Ø¨Ø§Ù„Øº Ø¨ÙƒØ³ÙˆØ± ØºÙŠØ± ØµØ­ÙŠØ­Ø©ØŒ ÙØ¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© ØªÙØ­Ø³Ø¨ Ø¨Ø§Ù„Ù‚Ø±ÙˆØ´ (Piasters) Ù„Ø¶Ù…Ø§Ù† Ø¹Ø¯Ù… Ø¶ÙŠØ§Ø¹ Ù‚Ø±Ø´ ÙˆØ§Ø­Ø¯.'
  },
  {
    id: 'purchases_guide',
    sectionId: 'purchases',
    title: 'ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†',
    summary: 'ØªØ³Ø¬ÙŠÙ„ Ø¨Ø¶Ø§Ø¦Ø¹ Ø§Ù„ØªÙˆØ±ÙŠØ¯ØŒ ØªØ­Ø¯ÙŠØ« ØªÙƒÙ„ÙØ© Ø§Ù„Ø´Ø±Ø§Ø¡ØŒ Ø¥Ø¯Ø§Ø±Ø© Ø¯ÙŠÙˆÙ† Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØ³Ø¯Ø§Ø¯ Ø§Ù„Ø¯ÙØ¹Ø§Øª.',
    keywords: ['Ù…Ø´ØªØ±ÙŠØ§Øª', 'Ù…ÙˆØ±Ø¯ÙŠÙ†', 'ÙØ§ØªÙˆØ±Ø© Ø´Ø±Ø§Ø¡', 'ØªÙˆØ±ÙŠØ¯', 'Ø¯ÙØ¹Ø§Øª', 'Ø¯ÙŠÙˆÙ† Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†', 'ØªÙƒÙ„ÙØ©'],
    goldenRule: 'Ø¹Ù†Ø¯ ØªØ³Ø¬ÙŠÙ„ ÙØ§ØªÙˆØ±Ø© Ø´Ø±Ø§Ø¡ Ø¬Ø¯ÙŠØ¯Ø©ØŒ ÙŠÙØ­Ø¯Ù‘Ø« Ø§Ù„Ù†Ø¸Ø§Ù… Ø³Ø¹Ø± Ø§Ù„ØªÙƒÙ„ÙØ© ÙˆØ±ØµÙŠØ¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† ÙÙˆØ±Ø§Ù‹ ÙˆÙŠÙØ«Ø¨Øª Ø­Ø±ÙƒØ© Ø§Ù„ÙˆØ§Ø±Ø¯ ÙÙŠ Ø§Ù„Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø§Ù„Ø°Ø±ÙŠØ©.',
    steps: [
      {
        badge: '1',
        title: 'Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…ÙˆØ±Ø¯',
        description: 'Ø­Ø¯Ø¯ Ø§Ù„Ù…ÙˆØ±Ø¯ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø£Ùˆ Ø£Ø¶Ù Ù…ÙˆØ±Ø¯Ø§Ù‹ Ø¬Ø¯ÙŠØ¯Ø§Ù‹ Ø¨Ø±Ù‚Ù… Ù‡Ø§ØªÙÙ‡ ÙˆØ¹Ù†ÙˆØ§Ù†Ù‡ ÙˆØ§Ø³Ù… Ø´Ø±ÙƒØªÙ‡.',
        shortcut: 'Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†'
      },
      {
        badge: '2',
        title: 'Ø¥Ø¯Ø®Ø§Ù„ Ø£ØµÙ†Ø§Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø© ÙˆØ£Ø³Ø¹Ø§Ø± Ø§Ù„ØªÙƒÙ„ÙØ©',
        description: 'Ø§Ù…Ø³Ø­ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„ÙˆØ§ØµÙ„Ø©ØŒ Ø£Ø¯Ø®Ù„ Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„ÙˆØ§Ø±Ø¯Ø© ÙˆØ³Ø¹Ø± Ø´Ø±Ø§Ø¡ Ø§Ù„Ù‚Ø·Ø¹Ø© Ù„ÙŠÙØ­Ø³Ø¨ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.',
        shortcut: 'Ø¥Ø¶Ø§ÙØ© Ø£ØµÙ†Ø§Ù'
      },
      {
        badge: '3',
        title: 'ØªØ­Ø¯ÙŠØ¯ Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø³Ø¯Ø§Ø¯ (Ù†Ù‚Ø¯Ø§Ù‹ Ø£Ùˆ Ø¢Ø¬Ù„)',
        description: 'Ø¥Ø°Ø§ Ø¯ÙØ¹Øª Ù„Ù„Ù…ÙˆØ±Ø¯ Ø¬Ø²Ø¡Ø§Ù‹ Ù…Ù† Ø§Ù„ÙØ§ØªÙˆØ±Ø©ØŒ Ø£Ø¯Ø®Ù„ Ø§Ù„Ù…Ø¯ÙÙˆØ¹ Ù†Ù‚Ø¯Ø§Ù‹ ÙˆØ³ÙŠÙØ±Ø­Ù‘Ù„ Ø§Ù„Ø¨Ø§Ù‚ÙŠ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¥Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ±Ø¯ ÙƒØ±ØµÙŠØ¯ Ù…Ø³ØªØ­Ù‚ Ù„Ù‡.',
        shortcut: 'Ø­ÙØ¸ Ø§Ù„ÙØ§ØªÙˆØ±Ø©'
      },
      {
        badge: '4',
        title: 'Ø³Ø¯Ø§Ø¯ Ø¯ÙØ¹Ø© Ù†Ù‚Ø¯ÙŠØ© Ù„Ù…ÙˆØ±Ø¯',
        description: 'Ù…Ù† ØµÙØ­Ø© "Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†"ØŒ Ø§ÙØªØ­ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ±Ø¯ ÙˆØ§Ø¶ØºØ· "ØªØ³Ø¬ÙŠÙ„ Ø¯ÙØ¹Ø© Ø³Ø¯Ø§Ø¯" Ù„Ø®ØµÙ…Ù‡Ø§ Ù…Ù† Ø­Ø³Ø§Ø¨Ù‡ ÙˆØ¥Ø«Ø¨Ø§ØªÙ‡Ø§ ÙÙŠ Ø§Ù„Ø®Ø²ÙŠÙ†Ø©.',
        shortcut: 'Ø³Ø¯Ø§Ø¯ Ø¯ÙØ¹Ø©'
      }
    ]
  },
  {
    id: 'customers_guide',
    sectionId: 'customers',
    title: 'Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¯ÙŠÙˆÙ† (Ø§Ù„Ø´ÙƒÙƒ)',
    summary: 'Ø¥Ø¯Ø§Ø±Ø© Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø²Ø¨Ø§Ø¦Ù†ØŒ Ø¨ÙŠØ¹ Ø§Ù„Ø¢Ø¬Ù„ Ø¨Ø­Ø¯ Ø§Ø¦ØªÙ…Ø§Ù†ÙŠØŒ ØªØ­ØµÙŠÙ„ Ø§Ù„Ø¯ÙŠÙˆÙ†ØŒ ÙˆØ·Ø¨Ø§Ø¹Ø© ÙƒØ´Ù Ø§Ù„Ø­Ø³Ø§Ø¨.',
    keywords: ['Ø¹Ù…Ù„Ø§Ø¡', 'Ø´ÙƒÙƒ', 'Ø¯ÙŠÙˆÙ†', 'Ø¢Ø¬Ù„', 'Ø³Ø¯Ø§Ø¯', 'ÙƒØ´Ù Ø­Ø³Ø§Ø¨', 'Ø³Ù‚Ù Ø§Ù„Ø§Ø¦ØªÙ…Ø§Ù†', 'Ø¹Ù…ÙŠÙ„'],
    goldenRule: 'Ø­Ø¯Ø¯ Ø³Ù‚Ù Ø§Ø¦ØªÙ…Ø§Ù†ÙŠ (Credit Limit) Ù„ÙƒÙ„ Ø¹Ù…ÙŠÙ„ Ø¢Ø¬Ù„Ø› Ø³ÙŠÙ†Ø¨Ù‡Ùƒ Ø§Ù„Ù†Ø¸Ø§Ù… ÙÙˆØ±Ø§Ù‹ Ø¥Ø°Ø§ Ø­Ø§ÙˆÙ„ Ø§Ù„Ø²Ø¨ÙˆÙ† Ø´Ø±Ø§Ø¡ Ø¨Ø¶Ø§Ø¹Ø© ØªØªØ¬Ø§ÙˆØ² Ø§Ù„Ø­Ø¯ Ø§Ù„Ù…Ø³Ù…ÙˆØ­ Ø¨Ù‡.',
    steps: [
      {
        badge: '1',
        title: 'Ø¥Ø¶Ø§ÙØ© Ù…Ù„Ù Ø¹Ù…ÙŠÙ„ Ø¬Ø¯ÙŠØ¯',
        description: 'Ø£Ø¯Ø®Ù„ Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„ ÙˆØ±Ù‚Ù… Ù‡Ø§ØªÙÙ‡ ÙˆØ³Ù‚Ù Ø§Ù„Ø§Ø¦ØªÙ…Ø§Ù† Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø³Ù…ÙˆØ­ Ø¨Ù‡ Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡.',
        shortcut: 'Ø¹Ù…ÙŠÙ„ Ø¬Ø¯ÙŠØ¯'
      },
      {
        badge: '2',
        title: 'Ø§Ù„Ø¨ÙŠØ¹ Ø¨Ø§Ù„Ø¢Ø¬Ù„ Ù„Ù„Ø¹Ù…ÙŠÙ„',
        description: 'ÙÙŠ Ø´Ø§Ø´Ø© Ø§Ù„Ø¨ÙŠØ¹ Ø§Ø¶ØºØ· F3 ÙˆØ§Ø®ØªØ± Ø§Ù„Ø¹Ù…ÙŠÙ„ØŒ Ø«Ù… ÙÙŠ Ø´Ø§Ø´Ø© Ø§Ù„Ø¯ÙØ¹ (F9) Ø§Ø®ØªØ± "Ø¢Ø¬Ù„" ÙˆØ³ÙŠÙØ¶Ø§Ù Ù…Ø¨Ù„Øº Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¥Ù„Ù‰ Ø±ØµÙŠØ¯ Ø¯ÙŠÙ†Ù‡.',
        shortcut: 'F3 + F9'
      },
      {
        badge: '3',
        title: 'ØªØ­ØµÙŠÙ„ Ø¯ÙŠÙˆÙ† Ø§Ù„Ø¹Ù…ÙŠÙ„ (Ø³Ø¯Ø§Ø¯ Ø¬Ø²Ø¦ÙŠ Ø£Ùˆ ÙƒÙ„ÙŠ)',
        description: 'Ù…Ù† ØµÙØ­Ø© Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ø¶ØºØ· "Ø³Ø¯Ø§Ø¯ Ø¯ÙŠÙ†"ØŒ Ø£Ø¯Ø®Ù„ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³Ø¯Ø¯ Ù†Ù‚Ø¯Ø§Ù‹ ÙˆØ³ÙŠØ·Ø¨Ø¹ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø¥ÙŠØµØ§Ù„ Ø§Ø³ØªÙ„Ø§Ù… Ù†Ù‚Ø¯ÙŠØ© Ù„Ù„Ø¹Ù…ÙŠÙ„.',
        shortcut: 'Ø³Ø¯Ø§Ø¯ Ø¯ÙŠÙ†'
      },
      {
        badge: '4',
        title: 'ØªØµØ¯ÙŠØ± ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¥ÙƒØ³Ù„ Ø£Ùˆ PDF',
        description: 'ÙŠÙ…ÙƒÙ†Ùƒ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø¬Ù…ÙŠØ¹ ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ø¹Ù…ÙŠÙ„ ÙˆØªÙˆØ§Ø±ÙŠØ® Ø³Ø¯Ø§Ø¯Ù‡ ÙˆØªØµØ¯ÙŠØ±Ù‡Ø§ ÙƒÙ…Ù„Ù Excel Ø£Ùˆ Ø·Ø¨Ø§Ø¹ØªÙ‡Ø§ Ø¨Ù†Ù‚Ø±Ø© ÙˆØ§Ø­Ø¯Ø©.',
        shortcut: 'ÙƒØ´Ù Ø­Ø³Ø§Ø¨'
      }
    ]
  },
  {
    id: 'sales_guide',
    sectionId: 'sales',
    title: 'Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØ§Ù„Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙŠÙˆÙ…ÙŠ (Z-Report)',
    summary: 'Ù…Ø±Ø§Ø¬Ø¹Ø© ÙÙˆØ§ØªÙŠØ± Ø§Ù„ÙƒØ§Ø´ÙŠØ±ØŒ ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ ÙˆØ§Ù„Ù…Ø¨ÙŠØ¹Ø§ØªØŒ ÙˆÙ…Ø·Ø§Ø¨Ù‚Ø© Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø§Ù„ÙØ¹Ù„ÙŠØ© Ù…Ø¹ Ø§Ù„Ø¯Ø±Ø¬.',
    keywords: ['Ù…Ø¨ÙŠØ¹Ø§Øª', 'ØªÙ‚Ø§Ø±ÙŠØ±', 'Ø¥ØºÙ„Ø§Ù‚ ÙŠÙˆÙ…ÙŠ', 'ÙˆØ±Ø¯ÙŠØ©', 'Ø£Ø±Ø¨Ø§Ø­', 'Ø®Ø²ÙŠÙ†Ø©', 'Ø¯Ø±Ø¬', 'z-report'],
    goldenRule: 'Ù†ÙÙ‘Ø° Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙŠÙˆÙ…ÙŠ Ø¹Ù†Ø¯ Ù†Ù‡Ø§ÙŠØ© ÙƒÙ„ ÙˆØ±Ø¯ÙŠØ©ØŒ ÙˆØ£Ø¯Ø®Ù„ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø§Ù„ÙØ¹Ù„ÙŠØ© Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„Ø¯Ø±Ø¬ Ù„ÙŠÙƒØªØ´Ù Ø§Ù„Ù†Ø¸Ø§Ù… Ø£ÙŠ Ø¹Ø¬Ø² Ø£Ùˆ Ø²ÙŠØ§Ø¯Ø© Ø¨Ø¯Ù‚Ø©.',
    steps: [
      {
        badge: '1',
        title: 'Ù…Ø±Ø§Ø¬Ø¹Ø© ÙÙˆØ§ØªÙŠØ± Ø§Ù„ÙŠÙˆÙ…',
        description: 'Ù…Ù† ØªØ¨ÙˆÙŠØ¨ "ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª" ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ø³ØªØ¹Ø±Ø§Ø¶ Ø¬Ù…ÙŠØ¹ Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„ØµØ§Ø¯Ø±Ø©ØŒ Ø·Ø±ÙŠÙ‚Ø© Ø¯ÙØ¹Ù‡Ø§ØŒ ÙˆØ§Ø³Ù… Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ø°ÙŠ Ø£ØµØ¯Ø±Ù‡Ø§.',
        shortcut: 'Ø³Ø¬Ù„ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª'
      },
      {
        badge: '2',
        title: 'Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙŠÙˆÙ…ÙŠ (Z-Report)',
        description: 'Ø§Ø¶ØºØ· "Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© ÙˆØ§Ù„ÙˆØ±Ø¯ÙŠØ©"ØŒ Ø¹Ø¯Ù‘ Ø§Ù„ÙÙ„ÙˆØ³ Ø§Ù„ÙØ¹Ù„ÙŠØ© ÙÙŠ Ø§Ù„Ø¯Ø±Ø¬ ÙˆØ§ÙƒØªØ¨Ù‡Ø§ØŒ Ù„ÙŠÙ‚Ø§Ø±Ù†Ù‡Ø§ Ø§Ù„Ù†Ø¸Ø§Ù… Ù…Ø¹ Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„Ù…Ø³Ø¬Ù„Ø©.',
        shortcut: 'Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙŠÙˆÙ…ÙŠØ©'
      },
      {
        badge: '3',
        title: 'Ø·Ø¨Ø§Ø¹Ø© ØªÙ‚Ø±ÙŠØ± Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ø­Ø±Ø§Ø±ÙŠ',
        description: 'ÙŠØ·Ø¨Ø¹ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø¥ÙŠØµØ§Ù„Ø§Ù‹ Ù…Ø¯Ù…Ø¬Ø§Ù‹ Ù„Ù„Ø¯Ø±Ø¬ ÙŠÙˆØ¶Ø­: Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ÙƒØ§Ø´ØŒ Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„ÙÙŠØ²Ø§ØŒ Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„Ø¢Ø¬Ù„ØŒ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§ØªØŒ ÙˆØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„ØªÙ‚Ø¯ÙŠØ±ÙŠ.',
        shortcut: 'Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¥ØºÙ„Ø§Ù‚'
      }
    ]
  },
  {
    id: 'backup_security_guide',
    sectionId: 'backup_security',
    title: 'Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠ ÙˆØ§Ù„Ø£Ù…Ø§Ù† ÙˆØ­Ù…Ø§ÙŠØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',
    summary: 'Ø­Ù…Ø§ÙŠØ© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù„ Ù…Ù† Ø§Ù†Ù‚Ø·Ø§Ø¹ Ø§Ù„ÙƒÙ‡Ø±Ø¨Ø§Ø¡ ÙˆØªÙ„Ù Ø§Ù„Ù‡Ø§Ø±Ø¯ØŒ Ø§Ù„Ù†Ø³Ø® Ø¹Ù„Ù‰ ÙÙ„Ø§Ø´Ø© Ø®Ø§Ø±Ø¬ÙŠØ©ØŒ ÙˆØµÙ„Ø§Ø­ÙŠØ§Øª Ø§Ù„ÙƒØ§Ø´ÙŠØ±.',
    keywords: ['Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠ', 'ÙÙ„Ø§Ø´Ø©', 'Ù‚Ø§Ø¹Ø¯Ø© Ø¨ÙŠØ§Ù†Ø§Øª', 'Ø£Ù…Ø§Ù†', 'ÙƒÙ‡Ø±Ø¨Ø§Ø¡', 'Ø­Ù…Ø§ÙŠØ©', 'ØªØ±Ø®ÙŠØµ', 'ØµÙ„Ø§Ø­ÙŠØ§Øª'],
    goldenRule: 'Ø§Ø­Ø±Øµ Ø¹Ù„Ù‰ Ø£Ø®Ø° Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙŠÙˆÙ…ÙŠØ§Ù‹ Ø¹Ù„Ù‰ ÙÙ„Ø§Ø´Ø© USB Ø®Ø§Ø±Ø¬ÙŠØ© Ù„Ø­Ù…Ø§ÙŠØ© Ù…Ø­Ù„Ùƒ Ø­ØªÙ‰ Ù„Ùˆ ØªØ¹Ø±Ø¶ Ø¬Ù‡Ø§Ø² Ø§Ù„ÙƒÙ…Ø¨ÙŠÙˆØªØ± Ù„Ø£ÙŠ Ø­Ø§Ø¯Ø«.',
    steps: [
      {
        badge: '1',
        title: 'Ø¥Ù†Ø´Ø§Ø¡ Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙÙˆØ±ÙŠØ©',
        description: 'Ù…Ù† Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª > ØªØ¨ÙˆÙŠØ¨ Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØŒ Ø§Ø¶ØºØ· "Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠ ÙÙˆØ±ÙŠ". ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨Ø¶ØºØ· Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø¹ Ø§Ù„ØªØ§Ø±ÙŠØ® ÙˆØ§Ù„ÙˆÙ‚Øª.',
        shortcut: 'Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠ'
      },
      {
        badge: '2',
        title: 'ØªØ­Ø¯ÙŠØ¯ Ù…Ø¬Ù„Ø¯ Ø§Ù„ÙÙ„Ø§Ø´Ø© USB',
        description: 'ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ø®ØªÙŠØ§Ø± Ù…Ø¬Ù„Ø¯ Ø§Ù„ÙÙ„Ø§Ø´Ø© Ù…Ù† Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ù„ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨Ù†Ø³Ø® Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¥Ù„ÙŠÙ‡Ø§ Ø¨Ø¶ØºØ·Ø© Ø²Ø± ÙˆØ§Ø­Ø¯Ø© Ù‚Ø¨Ù„ Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬.',
        shortcut: 'ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ø³Ø§Ø±'
      },
      {
        badge: '3',
        title: 'ØªØµØ¯ÙŠØ± Ø´Ø§Ù…Ù„ Ù„ÙƒÙ„ Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ Ø¥Ù„Ù‰ Excel',
        description: 'Ù…Ù† ØªØ¨ÙˆÙŠØ¨ ÙØ­Øµ Ø§Ù„Ù†Ø¸Ø§Ù… Ø§Ø¶ØºØ· "ØªØµØ¯ÙŠØ± ÙƒÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù„ (Excel)" Ù„Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ ÙƒØ§ÙØ© Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ ØºÙŠØ± Ù…Ø´ÙØ±Ø© Ù„Ø¶Ù…Ø§Ù† Ù…Ù„ÙƒÙŠØ© Ø¨ÙŠØ§Ù†Ø§ØªÙƒ 100%.',
        shortcut: 'ØªØµØ¯ÙŠØ± Ø´Ø§Ù…Ù„'
      },
      {
        badge: '4',
        title: 'Ù‚ÙÙ„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø¨ÙƒÙ„Ù…Ø© Ø³Ø± Ø§Ù„ÙƒØ§Ø´ÙŠØ±',
        description: 'ÙŠÙ…ÙƒÙ†Ùƒ Ù‚ÙÙ„ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ø¤Ù‚ØªØ§Ù‹ Ø¹Ù†Ø¯ Ù…ØºØ§Ø¯Ø±Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ù„Ù…Ù†Ø¹ Ø£ÙŠ ØªÙ„Ø§Ø¹Ø¨ØŒ Ù…Ø¹ Ø­Ø¬Ø¨ Ø´Ø§Ø´Ø§Øª Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ± ÙˆØ§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø¹Ù† Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„ÙƒØ§Ø´ÙŠØ±.',
        shortcut: 'Ù‚ÙÙ„ Ø§Ù„Ø´Ø§Ø´Ø©'
      }
    ]
  }
];

const FAQS: FaqItem[] = [
  {
    id: 'faq_power_outage',
    category: 'Ø§Ù„Ø£Ù…Ø§Ù† ÙˆØ§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',
    tag: 'Ø§Ù†Ù‚Ø·Ø§Ø¹ Ø§Ù„ÙƒÙ‡Ø±Ø¨Ø§Ø¡',
    question: 'Ù…Ø§Ø°Ø§ ÙŠØ­Ø¯Ø« Ù„Ùˆ Ø§Ù†Ù‚Ø·Ø¹Øª Ø§Ù„ÙƒÙ‡Ø±Ø¨Ø§Ø¡ ÙØ¬Ø£Ø© Ø£Ø«Ù†Ø§Ø¡ ØªØ³Ø¬ÙŠÙ„ ÙØ§ØªÙˆØ±Ø© Ø£Ùˆ Ø¥ØªÙ…Ø§Ù… Ø¹Ù…Ù„ÙŠØ© Ø¨ÙŠØ¹ØŸ',
    answer: 'Ù†Ø¸Ø§Ù… Ø±ÙÙŠÙ‚ Ù…Ø¨Ù†ÙŠ Ø¨ØªÙ‚Ù†ÙŠØ© SQLite WAL Ù…Ø¹ Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø°Ø±ÙŠØ© (ACID Transactions). Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø§Ù„ØªÙŠ ØªÙ… Ø§Ù„Ø¶ØºØ· Ø¹Ù„Ù‰ Ø¥Ù†Ù‡Ø§Ø¦Ù‡Ø§ ØªÙØ­ÙØ¸ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ ÙÙŠ Ø§Ù„Ù†ÙˆØ§Ø© ÙÙŠ Ø£Ø¬Ø²Ø§Ø¡ Ù…Ù† Ø§Ù„Ø«Ø§Ù†ÙŠØ©. ÙˆØ¥Ø°Ø§ Ø§Ù†Ù‚Ø·Ø¹Øª Ø§Ù„ÙƒÙ‡Ø±Ø¨Ø§Ø¡ ÙÙŠ Ù…Ù†ØªØµÙ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© ÙŠÙÙ„ØºÙ‰ Ø§Ù„Ø¬Ø²Ø¡ ØºÙŠØ± Ø§Ù„Ù…ÙƒØªÙ…Ù„ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙˆÙ„Ø§ ÙŠØ­Ø¯Ø« Ø£ÙŠ ØªÙ„Ù Ø£Ùˆ ØªØ¶Ø§Ø±Ø¨ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹.'
  },
  {
    id: 'faq_offline_guarantee',
    category: 'Ø§Ù„Ø´Ø¨ÙƒØ© ÙˆØ§Ù„Ø¥Ù†ØªØ±Ù†Øª',
    tag: 'Ø¨Ø¯ÙˆÙ† Ø¥Ù†ØªØ±Ù†Øª',
    question: 'Ù‡Ù„ ÙŠÙ…ÙƒÙ† ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ ÙˆØ§Ù„Ø¨ÙŠØ¹ Ø¨Ø¯ÙˆÙ† Ø¥Ù†ØªØ±Ù†Øª Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ØŸ',
    answer: 'Ù†Ø¹Ù… Ø¨Ù†Ø³Ø¨Ø© 100%! Ø±ÙÙŠÙ‚ Ù‡Ùˆ Ù†Ø¸Ø§Ù… Ø£ÙˆÙÙ„Ø§ÙŠÙ† Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ (Offline-First). Ø¬Ù…ÙŠØ¹ ÙˆØ¸Ø§Ø¦Ù Ø§Ù„Ø¨ÙŠØ¹ØŒ Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¥ÙŠØµØ§Ù„Ø§ØªØŒ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†ØŒ ÙˆØ§Ù„ØªÙ‚Ø§Ø±ÙŠØ± ØªØ¹Ù…Ù„ Ø¯ÙˆÙ† Ø§Ù„Ø­Ø§Ø¬Ø© Ù„Ø£ÙŠ Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª. Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª Ù…Ø·Ù„ÙˆØ¨ ÙÙ‚Ø· Ù„Ø«ÙˆØ§Ù†Ù Ù…Ø¹Ø¯ÙˆØ¯Ø© Ø¹Ù†Ø¯ ØªÙØ¹ÙŠÙ„ Ø§Ù„ØªØ±Ø®ÙŠØµ Ù„Ø£ÙˆÙ„ Ù…Ø±Ø© Ø£Ùˆ ÙØ­Øµ Ø§Ù„ØªØ­Ø¯ÙŠØ«Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø§Ø®ØªÙŠØ§Ø±ÙŠØ§Ù‹.'
  },
  {
    id: 'faq_barcode_trouble',
    category: 'Ø§Ù„Ø¹ØªØ§Ø¯ ÙˆØ§Ù„Ø£Ø¬Ù‡Ø²Ø©',
    tag: 'Ù‚Ø§Ø±Ø¦ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯',
    question: 'Ù‚Ø§Ø±Ø¦ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ù„Ø§ ÙŠØ³ØªØ¬ÙŠØ¨ Ø£Ùˆ ÙŠÙƒØªØ¨ Ø­Ø±ÙˆÙØ§Ù‹ Ø¹Ø±Ø¨ÙŠØ© Ù…Ù„Ø®Ø¨Ø·Ø©ØŒ ÙƒÙŠÙ Ø£ØµÙ„Ø­Ù‡ØŸ',
    answer: 'Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© ØªØ­Ø¯Ø« Ù„Ø£Ù† Ù„ØºØ© Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„ÙˆÙŠÙ†Ø¯ÙˆØ² ØªÙƒÙˆÙ† Ù…Ø¶Ø¨ÙˆØ·Ø© Ø¹Ù„Ù‰ Ø§Ù„Ù„ØºØ© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©. Ø±ÙÙŠÙ‚ ÙŠØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ Ù…ÙŠØ²Ø© Ø§Ù„ØªØµØ­ÙŠØ­ Ø§Ù„Ø°Ø§ØªÙŠ Ù„Ù„Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©ØŒ ÙˆÙ„ÙƒÙ† Ù„Ø¶Ù…Ø§Ù† Ø£ÙØ¶Ù„ Ø³Ø±Ø¹Ø© Ø§Ø¶ØºØ· (Alt + Shift) ÙÙŠ Ø§Ù„ÙˆÙŠÙ†Ø¯ÙˆØ² Ù„ØªÙƒÙˆÙ† Ù„ØºØ© Ø§Ù„ÙƒÙŠØ¨ÙˆØ±Ø¯ Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© (EN)ØŒ ÙˆØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù† ÙƒØ§Ø¨Ù„ Ø§Ù„Ù€ USB Ù…ØªØµÙ„ Ø¨Ø¥Ø­ÙƒØ§Ù….'
  },
  {
    id: 'faq_thermal_printer',
    category: 'Ø§Ù„Ø¹ØªØ§Ø¯ ÙˆØ§Ù„Ø£Ø¬Ù‡Ø²Ø©',
    tag: 'Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„ÙÙˆØ§ØªÙŠØ±',
    question: 'Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø¥ÙŠØµØ§Ù„Ø§Øª Ø§Ù„Ø­Ø±Ø§Ø±ÙŠØ© Ù„Ø§ ØªÙ‚Ø·Ø¹ Ø§Ù„ÙˆØ±Ù‚ Ø£Ùˆ ØªØ·Ø¨Ø¹ Ù†ØµÙˆØµØ§Ù‹ ØºÙŠØ± ÙˆØ§Ø¶Ø­Ø©ØŸ',
    answer: 'Ø§Ø¯Ø®Ù„ Ø¥Ù„Ù‰ Ø´Ø§Ø´Ø© "Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª" Ø«Ù… ØªØ¨ÙˆÙŠØ¨ "Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø­Ø±Ø§Ø±ÙŠØ©"ØŒ ÙˆØªØ£ÙƒØ¯ Ù…Ù† Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…Ù‚Ø§Ø³ Ø§Ù„ØµØ­ÙŠØ­ Ù„Ø±ÙˆÙ„ Ø§Ù„ÙˆØ±Ù‚ (80mm Ø£Ùˆ 57mm). Ø§Ø³ØªØ®Ø¯Ù… Ø²Ø± "Ø·Ø¨Ø§Ø¹Ø© ØµÙØ­Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©" Ù„Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø§Ø³ØªØ¬Ø§Ø¨Ø© Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© ÙˆÙØªØ­ Ø¯Ø±Ø¬ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©. Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø·Ø¨Ø§Ø¹Ø© Ø¨Ø§Ù‡ØªØ© Ù†Ø¸Ù‘Ù Ø±Ø£Ø³ Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø­Ø±Ø§Ø±ÙŠ Ø¨Ù‚Ø·Ù†Ø© ÙƒØ­ÙˆÙ„ÙŠØ© Ø¨Ø±ÙÙ‚.'
  },
  {
    id: 'faq_weight_products',
    category: 'Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ§Ù„Ù…Ù†ØªØ¬Ø§Øª',
    tag: 'Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„ÙˆØ²Ù†ÙŠØ©',
    question: 'ÙƒÙŠÙ Ø£ØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ø¨Ø§Ø¹Ø© Ø¨Ø§Ù„ÙˆØ²Ù† Ù…Ø«Ù„ Ø§Ù„Ø¬Ø¨Ù†ØŒ Ø§Ù„Ù„Ø­ÙˆÙ…ØŒ Ø£Ùˆ Ø§Ù„Ø®Ø¶Ø§Ø±ØŸ',
    answer: 'Ø¹Ù†Ø¯ Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØµÙ†Ù Ø­Ø¯Ø¯ Ø§Ù„ÙˆØ­Ø¯Ø© "ÙƒÙŠÙ„ÙˆØ¬Ø±Ø§Ù…". ÙÙŠ Ø´Ø§Ø´Ø© Ø§Ù„Ø¨ÙŠØ¹ØŒ Ø¨Ø¹Ø¯ Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØµÙ†Ù Ø§Ø¶ØºØ· F4 Ù„ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ÙƒÙ…ÙŠØ© ÙˆØ£Ø¯Ø®Ù„ Ø§Ù„ÙˆØ²Ù† Ø¨Ø§Ù„Ø¬Ø±Ø§Ù… Ù…Ø¨Ø§Ø´Ø±Ø© (Ù…Ø«Ù„Ø§Ù‹: Ø±Ø¨Ø¹ ÙƒÙŠÙ„Ùˆ ÙŠÙÙƒØªØ¨ 250 Ø£Ùˆ 0.25). ÙƒÙ…Ø§ ÙŠØ¯Ø¹Ù… Ø§Ù„Ù†Ø¸Ø§Ù… Ù‚Ø±Ø§Ø¡Ø© Ø¨Ø§Ø±ÙƒÙˆØ¯ Ù…ÙˆØ§Ø²ÙŠÙ† Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙˆØ§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ù„Ø³Ø¹Ø± ÙˆØ§Ù„ÙˆØ²Ù† ÙÙˆØ±Ø§Ù‹.'
  },
  {
    id: 'faq_data_ownership',
    category: 'Ø§Ù„Ø£Ù…Ø§Ù† ÙˆØ§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',
    tag: 'Ù…Ù„ÙƒÙŠØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',
    question: 'Ù‡Ù„ Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø­Ù„ÙŠ Ù…Ø´ÙØ±Ø© Ø£Ùˆ Ù…Ø­Ø¨ÙˆØ³Ø© Ø¯Ø§Ø®Ù„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ØŒ ÙˆÙ…Ø§Ø°Ø§ Ù„Ùˆ Ø£Ø±Ø¯Øª Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ØŸ',
    answer: 'Ø¨ÙŠØ§Ù†Ø§ØªÙƒ Ù…Ù„ÙƒÙƒ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ø¨Ù†Ø³Ø¨Ø© 100%! ÙˆÙØ±Ù†Ø§ Ù…ÙŠØ²Ø© "ØªØµØ¯ÙŠØ± ÙƒÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù„ Ø¨Ø¶ØºØ·Ø© ÙˆØ§Ø­Ø¯Ø©" ÙÙŠ ØªØ¨ÙˆÙŠØ¨ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª > ÙØ­Øµ Ø§Ù„Ù†Ø¸Ø§Ù…ØŒ ÙˆØªÙØ®Ø±Ø¬ Ù„Ùƒ 8 Ù…Ù„ÙØ§Øª Excel Ù†Ù‚ÙŠØ© ÙˆÙ…ÙØµÙ„Ø© ØªØ´Ù…Ù„ Ø§Ù„Ù…Ù†ØªØ¬Ø§ØªØŒ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ø¯ÙŠÙˆÙ†ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†ØŒ ÙˆØ§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ù…Ø¹ Ø¨ÙŠØ§Ù† Ø±Ø³Ù…ÙŠ Ù„Ù…Ù„ÙƒÙŠØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø¯ÙˆÙ† Ø£ÙŠ Ù‚ÙŠÙˆØ¯ Ø£Ùˆ Ø§Ø­ØªÙƒØ§Ø±.'
  },
  {
    id: 'faq_license_renewal',
    category: 'Ø§Ù„ØªØ±Ø®ÙŠØµ ÙˆØ§Ù„Ø¯Ø¹Ù…',
    tag: 'ØªØ¬Ø¯ÙŠØ¯ Ø§Ù„ØªØ±Ø®ÙŠØµ',
    question: 'ÙƒÙŠÙ Ø£Ø¬Ø¯Ø¯ Ø§Ù„ØªØ±Ø®ÙŠØµ Ø£Ùˆ Ø£Ù†Ù‚Ù„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø¥Ù„Ù‰ Ø¬Ù‡Ø§Ø² ÙƒÙ…Ø¨ÙŠÙˆØªØ± Ø¬Ø¯ÙŠØ¯ØŸ',
    answer: 'ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ Ø¹Ù„Ù‰ Ø±Ù‚Ù… 01097782965 Ø£Ùˆ Ø¹Ø¨Ø± ÙˆØ§ØªØ³Ø§Ø¨ØŒ ÙˆÙ‚Ù… Ø¨Ù†Ø³Ø® "Ø¨ØµÙ…Ø© Ø§Ù„Ø¬Ù‡Ø§Ø²" Ù…Ù† Ø´Ø§Ø´Ø© Ø§Ù„ØªØ±Ø®ÙŠØµ Ø£Ùˆ Ù…Ù† ØªØ¨ÙˆÙŠØ¨ "Ø·Ù„Ø¨ Ø§Ù„Ø¯Ø¹Ù…" Ø¯Ø§Ø®Ù„ Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø©. Ø³ÙŠÙØ±Ø³Ù„ Ù„Ùƒ ÙØ±ÙŠÙ‚ Ø§Ù„Ø¯Ø¹Ù… ÙƒÙˆØ¯ Ø§Ù„ØªÙØ¹ÙŠÙ„ Ø§Ù„Ù…Ø­Ø¯Ø« ÙÙˆØ±Ø§Ù‹ ÙˆÙŠØªÙ… ØªÙØ¹ÙŠÙ„Ù‡ Ø¨Ù†Ù‚Ø±Ø© Ø²Ø± ÙˆØ§Ø­Ø¯Ø©.'
  }
];

export const HelpCenterModal = ({
  isOpen,
  onClose,
  initialSection = 'pos'
}: HelpCenterModalProps) => {
  const [activeSection, setActiveSection] = useState<HelpSectionId>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  // Support Bundle and System Info State
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfoData | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [supportSavedPath, setSupportSavedPath] = useState<string | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Sync initialSection on open
  useEffect(() => {
    if (isOpen && initialSection) {
      const validSections: HelpSectionId[] = [
        'pos', 'products', 'purchases', 'customers', 'sales', 'backup_security', 'faq', 'support'
      ];
      if (validSections.includes(initialSection as HelpSectionId)) {
        setActiveSection(initialSection as HelpSectionId);
      } else if (initialSection === 'settings') {
        setActiveSection('backup_security');
      } else if (initialSection === 'dashboard') {
        setActiveSection('sales');
      } else {
        setActiveSection('pos');
      }
    }
  }, [isOpen, initialSection]);

  // Load diagnostics and license info on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchInfo = async () => {
      try {
        const sys: SystemInfo = await invoke('system:getInfo');
        if (isMounted && sys) setSysInfo(sys);
      } catch {
        // fallback
      }
      try {
        const lic: LicenseInfoData = await invoke('license:getInfo');
        if (isMounted && lic) setLicenseInfo(lic);
      } catch {
        // fallback
      }
    };

    void fetchInfo();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Filtered Articles based on search query
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return HELP_ARTICLES;

    return HELP_ARTICLES.filter((art) => {
      const matchTitle = art.title.toLowerCase().includes(q);
      const matchSummary = art.summary.toLowerCase().includes(q);
      const matchKeywords = art.keywords.some((kw) => kw.toLowerCase().includes(q));
      const matchSteps = art.steps.some(
        (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
      return matchTitle || matchSummary || matchKeywords || matchSteps;
    });
  }, [searchQuery]);

  // Filtered FAQs based on search query
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FAQS;

    return FAQS.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.tag.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const activeArticle = useMemo(() => {
    return HELP_ARTICLES.find((a) => a.sectionId === activeSection);
  }, [activeSection]);

  const handleCreateSupportBundle = async () => {
    setSupportLoading(true);
    setSupportMessage(null);
    setSupportSavedPath(null);

    try {
      const res: any = await invoke('support:createBundle');
      if (res && res.success) {
        setSupportMessage(res.message || 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø²Ù…Ø© Ø§Ù„Ø¯Ø¹Ù… Ø¨Ù†Ø¬Ø§Ø­.');
        setSupportSavedPath(res.filePath || null);
      } else {
        setSupportMessage(res?.message || 'ØªØ¹Ø°Ø± Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø­Ø²Ù…Ø© Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSupportMessage(`Ø®Ø·Ø£ ÙÙŠ Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ù„Ø­Ø²Ù…Ø©: ${msg}`);
    } finally {
      setSupportLoading(false);
    }
  };

  const handleCopyFingerprint = async () => {
    const fp = licenseInfo?.deviceFingerprint || 'RAFIQ-POS-HOST';
    try {
      await navigator.clipboard.writeText(fp);
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText('01097782965');
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div 
        className="w-full max-w-5xl h-[88vh] max-h-[820px] bg-white rounded-2xl shadow-2xl border border-[#dce1dc] flex flex-col overflow-hidden font-sans text-[#0f172a]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#00372d] text-white flex items-center justify-between shrink-0 select-none shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#006d41] flex items-center justify-center text-white shadow-inner">
              <HelpCircle className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø© ÙˆØ§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  ÙŠØ¹Ù…Ù„ Ø¨Ø¯ÙˆÙ† Ø¥Ù†ØªØ±Ù†Øª (Offline)
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/80 m-0">
                Ø´Ø±ÙˆØ­Ø§Øª Ù…ØµÙˆØ±Ø©ØŒ Ø¥Ø¬Ø§Ø¨Ø§Øª Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ø´Ø§Ø¦Ø¹Ø©ØŒ ÙˆØ·Ù„Ø¨ Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ Ø§Ù„Ù…Ø¨Ø§Ø´Ø±
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('support')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSection === 'support'
                  ? 'bg-amber-400 text-[#00372d] shadow-sm'
                  : 'bg-white/10 hover:bg-white/20 text-emerald-100'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Ø·Ù„Ø¨ Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„Ù…Ø¨Ø§Ø´Ø±</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Ø¥ØºÙ„Ø§Ù‚ (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar & Fast Navigation Bar */}
        <div className="p-3 bg-[#f8fafc] border-b border-[#dce1dc] flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#52605d] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ø§Ø¨Ø­Ø« ÙÙŠ Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø© (Ù…Ø«Ø§Ù„: Ø¨Ø§Ø±ÙƒÙˆØ¯ØŒ ÙˆØ²Ù†ØŒ Ù…Ø±ØªØ¬Ø¹ØŒ Ø¢Ø¬Ù„ØŒ Ø·Ø§Ø¨Ø¹Ø©ØŒ Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©)..."
              className="w-full h-10 pr-9 pl-9 rounded-xl bg-white border border-[#dce1dc] focus:border-[#006d41] focus:ring-2 focus:ring-[#006d41]/20 text-xs text-[#0f172a] placeholder-[#52605d]/60 outline-hidden transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Ù…Ø³Ø­ Ø§Ù„Ø¨Ø­Ø«"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Body: 2 Columns (Sidebar Tabs + Content Area) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Navigation Sidebar */}
          <div className="w-64 bg-[#f8fafc] border-l border-[#dce1dc] p-2 flex flex-col gap-1 overflow-y-auto shrink-0 select-none">
            <span className="text-[11px] font-bold text-[#52605d] px-2 py-1">
              Ø´Ø±ÙˆØ­Ø§Øª Ø´Ø§Ø´Ø§Øª Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬
            </span>

            <button
              type="button"
              onClick={() => setActiveSection('pos')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'pos'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-4 h-4" />
                <span>Ù†Ù‚Ø·Ø© Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ§Ù„ÙƒØ§Ø´ÙŠØ±</span>
              </div>
              <span className={`text-[10px] font-mono px-1 rounded ${activeSection === 'pos' ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                F1
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('products')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'products'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4" />
                <span>Ø§Ù„Ø£ØµÙ†Ø§Ù ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ†</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('purchases')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'purchases'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4" />
                <span>Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('customers')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'customers'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ø¯ÙŠÙˆÙ† ÙˆØ§Ù„Ø¢Ø¬Ù„</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('sales')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'sales'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4" />
                <span>Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØ§Ù„Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙŠÙˆÙ…ÙŠ</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('backup_security')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'backup_security'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠ ÙˆØ§Ù„Ø£Ù…Ø§Ù†</span>
              </div>
            </button>

            <div className="h-px bg-[#dce1dc] my-2" />

            <span className="text-[11px] font-bold text-[#52605d] px-2 py-1">
              Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø© Ø§Ù„ØªÙØ§Ø¹Ù„ÙŠØ©
            </span>

            <button
              type="button"
              onClick={() => setActiveSection('faq')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'faq'
                  ? 'bg-[#006d41] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileQuestion className="w-4 h-4" />
                <span>Ø§Ù„Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ø´Ø§Ø¦Ø¹Ø© (FAQ)</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                {FAQS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('support')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer mt-auto border ${
                activeSection === 'support'
                  ? 'bg-[#00372d] text-amber-300 border-[#00372d] shadow-xs'
                  : 'bg-emerald-50 text-[#006d41] border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Headphones className="w-4 h-4" />
                <span>Ø·Ù„Ø¨ Ø§Ù„Ø¯Ø¹Ù… ÙˆØ§Ù„Ù…ÙˆØ§ØµÙØ§Øª</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          </div>

          {/* Content Viewport */}
          <div className="flex-1 p-5 overflow-y-auto bg-white min-h-0">
            {/* Search Results Override View */}
            {searchQuery.trim().length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#dce1dc]">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-[#006d41]" />
                    <span className="text-sm font-bold text-[#0f172a]">
                      Ù†ØªØ§Ø¦Ø¬ Ø§Ù„Ø¨Ø­Ø« Ø¹Ù†: "{searchQuery}"
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    ÙˆØ¬Ø¯ {filteredArticles.length} Ø´Ø±Ø­ Ùˆ {filteredFaqs.length} Ø³Ø¤Ø§Ù„ Ø´Ø§Ø¦Ø¹
                  </span>
                </div>

                {filteredArticles.length === 0 && filteredFaqs.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                    <p className="font-bold text-sm">Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø´Ø±ÙˆØ­Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¨Ø­Ø«</p>
                    <p className="text-xs text-slate-400">
                      Ø¬Ø±Ø¨ Ø§Ù„Ø¨Ø­Ø« Ø¨ÙƒÙ„Ù…Ø§Øª Ø£Ø®Ø±Ù‰ Ù…Ø«Ù„ "ÙƒØ§Ø´ÙŠØ±"ØŒ "Ø¨Ø§Ø±ÙƒÙˆØ¯"ØŒ "Ø¯ÙŠÙˆÙ†"ØŒ Ø£Ùˆ ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„Ù…Ø¨Ø§Ø´Ø±.
                    </p>
                  </div>
                ) : null}

                {/* Matching Guides */}
                {filteredArticles.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold text-[#52605d] uppercase tracking-wider">
                      Ø´Ø±ÙˆØ­Ø§Øª Ø§Ù„Ø´Ø§Ø´Ø§Øª ÙˆØ§Ù„Ø®Ø·ÙˆØ§Øª
                    </h3>
                    {filteredArticles.map((art) => (
                      <div
                        key={art.id}
                        className="p-4 rounded-xl border border-[#dce1dc] hover:border-[#006d41]/50 bg-[#f8fafc] transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-[#00372d]">{art.title}</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSection(art.sectionId);
                              setSearchQuery('');
                            }}
                            className="text-xs font-bold text-[#006d41] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>Ø¹Ø±Ø¶ Ø§Ù„Ø¯Ù„ÙŠÙ„ Ø§Ù„ÙƒØ§Ù…Ù„</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 m-0">{art.summary}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Matching FAQs */}
                {filteredFaqs.length > 0 && (
                  <div className="flex flex-col gap-3 mt-2">
                    <h3 className="text-xs font-bold text-[#52605d] uppercase tracking-wider">
                      Ø§Ù„Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ø´Ø§Ø¦Ø¹Ø© Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©
                    </h3>
                    {filteredFaqs.map((faq) => (
                      <div
                        key={faq.id}
                        className="p-4 rounded-xl border border-[#dce1dc] bg-[#f8fafc] flex flex-col gap-2"
                      >
                        <span className="text-[10px] font-bold text-[#006d41] bg-emerald-50 px-2 py-0.5 rounded-md w-fit border border-emerald-200">
                          {faq.category} â€¢ {faq.tag}
                        </span>
                        <h4 className="font-bold text-xs text-[#0f172a] m-0">{faq.question}</h4>
                        <p className="text-xs text-slate-600 m-0 leading-relaxed">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standard Category View (when not searching) */}
            {searchQuery.trim().length === 0 && (
              <>
                {/* 1. ARTICLES VIEW */}
                {activeSection !== 'faq' && activeSection !== 'support' && activeArticle && (
                  <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                    {/* Title banner */}
                    <div className="flex flex-col gap-1.5 pb-4 border-b border-[#dce1dc]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[#00372d] m-0">
                          {activeArticle.title}
                        </h3>
                        <span className="text-xs font-bold text-[#006d41] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ø´Ø±Ø­ Ø¹Ù…Ù„ÙŠ Ø®Ø·ÙˆØ© Ø¨Ø®Ø·ÙˆØ©</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed m-0">
                        {activeArticle.summary}
                      </p>
                    </div>

                    {/* Golden Rule Tip Card */}
                    {activeArticle.goldenRule && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3 shadow-2xs">
                        <Flame className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                          <span className="font-bold block text-amber-800 mb-0.5">
                            Ù†ØµÙŠØ­Ø© Ø°Ù‡Ø¨ÙŠØ© Ù„Ø³Ø±Ø¹Ø© Ø§Ù„Ø¹Ù…Ù„:
                          </span>
                          <span>{activeArticle.goldenRule}</span>
                        </div>
                      </div>
                    )}

                    {/* Step by Step Visual Guide Cards */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#52605d]">
                        <Keyboard className="w-4 h-4 text-[#00372d]" />
                        <span>Ø§Ù„Ø®Ø·ÙˆØ§Øª Ø§Ù„Ø¹Ù…Ù„ÙŠØ© ÙˆØ§Ø®ØªØµØ§Ø±Ø§Øª Ø§Ù„Ø³Ø±Ø¹Ø©:</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeArticle.steps.map((st, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-xl border border-[#dce1dc] hover:border-[#006d41]/60 bg-[#f8fafc] flex flex-col gap-2 transition-all shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-[#00372d] text-white text-xs font-bold flex items-center justify-center shrink-0">
                                  {st.badge}
                                </span>
                                <h4 className="font-bold text-xs text-[#0f172a] m-0">
                                  {st.title}
                                </h4>
                              </div>

                              {st.shortcut && (
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-[#dce1dc] text-[#00372d] shadow-2xs">
                                  {st.shortcut}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-600 leading-relaxed m-0 font-sans">
                              {st.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Troubleshooting Footnote */}
                    {activeArticle.troubleshooting && (
                      <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <span className="font-bold">Ø­Ù„ Ø§Ù„Ù…Ø´Ø§ÙƒÙ„ Ø§Ù„Ø´Ø§Ø¦Ø¹Ø©: </span>
                          <span>{activeArticle.troubleshooting}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. FAQ ACCORDION VIEW */}
                {activeSection === 'faq' && (
                  <div className="flex flex-col gap-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-[#dce1dc]">
                      <div>
                        <h3 className="text-base font-bold text-[#00372d] m-0">
                          Ø§Ù„Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ø´Ø§Ø¦Ø¹Ø© ÙˆØ­Ù„ÙˆÙ„ Ø§Ù„Ù…Ø´Ø§ÙƒÙ„ Ø§Ù„ÙˆØ§Ù‚Ø¹ÙŠØ©
                        </h3>
                        <p className="text-xs text-slate-500 m-0">
                          Ø¥Ø¬Ø§Ø¨Ø§Øª ÙˆØ§Ø¶Ø­Ø© ÙˆÙ…Ø¨Ø§Ø´Ø±Ø© Ù„ØªØ³Ø§Ø¤Ù„Ø§Øª Ø£ØµØ­Ø§Ø¨ Ø§Ù„Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª ÙˆÙ…Ø­Ù„Ø§Øª Ø§Ù„ØªØ¬Ø²Ø¦Ø© Ø¨Ø¯ÙˆÙ† Ø¥Ù†ØªØ±Ù†Øª
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {FAQS.length} Ø¥Ø¬Ø§Ø¨Ø© Ù…Ø¹ØªÙ…Ø¯Ø©
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {FAQS.map((faq) => {
                        const isExpanded = expandedFaqId === faq.id;
                        return (
                          <div
                            key={faq.id}
                            className={`rounded-xl border transition-all overflow-hidden ${
                              isExpanded
                                ? 'border-[#006d41] bg-white shadow-xs'
                                : 'border-[#dce1dc] bg-[#f8fafc] hover:border-slate-400'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                              className="w-full p-3.5 text-right flex items-center justify-between gap-3 cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100/70 text-[#006d41] border border-emerald-200 shrink-0">
                                  {faq.tag}
                                </span>
                                <span className="font-bold text-xs text-[#0f172a] leading-tight">
                                  {faq.question}
                                </span>
                              </div>

                              <span className="text-slate-400 shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#006d41]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 text-xs text-slate-700 leading-relaxed border-t border-[#dce1dc]/60 bg-white">
                                <p className="m-0 font-sans">{faq.answer}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. SUPPORT & DIAGNOSTICS VIEW (Task 147-3) */}
                {activeSection === 'support' && (
                  <div className="flex flex-col gap-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-[#dce1dc]">
                      <div>
                        <h3 className="text-base font-bold text-[#00372d] m-0">
                          Ø·Ù„Ø¨ Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± ÙˆØ¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¬Ù‡Ø§Ø²
                        </h3>
                        <p className="text-xs text-slate-500 m-0">
                          Ø¨ÙŠØ§Ù†Ø§Øª Ø¬Ù‡Ø§Ø²Ùƒ ÙˆØ§Ù„ØªØ±Ø®ÙŠØµ ÙˆØ±Ù‚Ù… Ø§Ù„Ø§ØªØµØ§Ù„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ù…Ø¹ Ù…Ù‡Ù†Ø¯Ø³ÙŠ Ø±ÙÙŠÙ‚ POS
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Ø¯Ø¹Ù… ÙÙ†ÙŠ Ù…Ø¹ØªÙ…Ø¯</span>
                      </div>
                    </div>

                    {/* Direct Contact Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Phone Call Card */}
                      <div className="p-4 rounded-xl bg-[#00372d] text-white flex flex-col justify-between gap-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <PhoneCall className="w-4 h-4 text-amber-300" />
                            <span className="text-xs font-bold text-white">Ø§Ù„Ù‡Ø§ØªÙ ÙˆØ®Ø¯Ù…Ø© Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ù„Ù…Ø¨Ø§Ø´Ø±Ø©</span>
                          </div>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/20 font-bold">
                            Ù…ØªØ§Ø­ Ø·ÙˆØ§Ù„ Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-white/10">
                          <a
                            href="tel:01097782965"
                            className="font-mono text-base font-black tracking-wider text-amber-300 hover:underline select-all"
                            dir="ltr"
                            title="Ø§Ù†Ù‚Ø± Ù„Ù„Ø§ØªØµØ§Ù„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø±"
                          >
                            01097782965
                          </a>

                          <button
                            type="button"
                            onClick={() => void handleCopyPhone()}
                            className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedPhone ? 'ØªÙ… Ø§Ù„Ù†Ø³Ø®' : 'Ù†Ø³Ø® Ø§Ù„Ø±Ù‚Ù…'}</span>
                          </button>
                        </div>

                        <p className="text-[11px] text-emerald-100/70 m-0">
                          ÙŠÙ…ÙƒÙ†Ùƒ Ø£ÙŠØ¶Ø§Ù‹ Ù…Ø±Ø§Ø³Ù„ØªÙ†Ø§ Ø¹Ø¨Ø± Ø§Ù„ÙˆØ§ØªØ³Ø§Ø¨ Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„Ø±Ù‚Ù… Ù„Ø¥Ø±Ø³Ø§Ù„ Ø­Ø²Ù…Ø© Ø§Ù„Ø¯Ø¹Ù… Ø£Ùˆ Ø§Ù„Ø§Ø³ØªÙØ³Ø§Ø±.
                        </p>
                      </div>

                      {/* Hardware Fingerprint & Machine Identity */}
                      <div className="p-4 rounded-xl border border-[#dce1dc] bg-[#f8fafc] flex flex-col justify-between gap-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
                            <KeyRound className="w-4 h-4 text-[#006d41]" />
                            <span>Ø¨ØµÙ…Ø© Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø² (Machine ID)</span>
                          </div>
                          <span className="text-[10px] text-slate-500">Ù…Ø·Ù„ÙˆØ¨Ø© Ù„ØªÙØ¹ÙŠÙ„ Ø§Ù„ØªØ±Ø®ÙŠØµ</span>
                        </div>

                        <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-[#dce1dc]">
                          <span className="font-mono text-xs font-bold text-[#00372d] tracking-wider truncate select-all" dir="ltr">
                            {licenseInfo?.deviceFingerprint || 'RAFIQ-POS-HOST'}
                          </span>

                          <button
                            type="button"
                            onClick={() => void handleCopyFingerprint()}
                            className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[#0f172a] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                          >
                            {copiedFingerprint ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedFingerprint ? 'ØªÙ… Ø§Ù„Ù†Ø³Ø®' : 'Ù†Ø³Ø®'}</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span>Ø§Ø³Ù… Ø§Ù„Ù…Ø­Ù„: <strong>{licenseInfo?.shopName || 'Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª Ø±ÙÙŠÙ‚'}</strong></span>
                          <span>Ø§Ù„ØªØ±Ø®ÙŠØµ: <strong className="text-[#006d41]">{licenseInfo?.statusLabel || 'Ù…ÙØ¹Ù‘Ù„'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* System Diagnostic Spec Grid */}
                    <div className="p-3.5 rounded-xl border border-[#dce1dc] bg-[#f8fafc] flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
                        <Cpu className="w-4 h-4 text-[#00372d]" />
                        <span>Ù…ÙˆØ§ØµÙØ§Øª ÙˆØ¥ØµØ¯Ø§Ø± Ø§Ù„Ù†Ø¸Ø§Ù… Ø§Ù„Ø­Ø§Ù„ÙŠ:</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">Ø¥ØµØ¯Ø§Ø± Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬</span>
                          <span className="font-mono font-bold text-[#00372d]">{sysInfo?.version || 'v1.0.0'}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">Ù†Ø¸Ø§Ù… Ø§Ù„ØªØ´ØºÙŠÙ„</span>
                          <span className="font-bold text-[#0f172a] truncate block">{sysInfo?.osVersion || 'Windows'}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</span>
                          <span className="font-bold text-[#006d41]">{sysInfo?.dbStatus || 'SQLite (WAL)'}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">Ù†ÙˆØ¹ Ø§Ù„ØªØ±Ø®ÙŠØµ</span>
                          <span className="font-bold text-[#0f172a]">{licenseInfo?.licenseType || 'Ø¯Ø§Ø¦Ù…'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Support Bundle Generation Action Card (Task 147-3 & Feature #111) */}
                    <div className="p-4 rounded-xl border border-[#006d41]/30 bg-emerald-50/50 flex flex-col gap-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#006d41]" />
                          <span className="font-bold text-xs text-[#00372d]">
                            ØªÙˆÙ„ÙŠØ¯ Ø­Ø²Ù…Ø© Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ ÙˆØ³Ø¬Ù„ Ø§Ù„Ø£Ø®Ø·Ø§Ø¡ (Support Bundle)
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-md">
                          Ù…Ø­Ù…ÙŠØ© ÙˆØ®Ø§Ù„ÙŠØ© Ù…Ù† Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø²Ø¨Ø§Ø¦Ù† ÙˆØ§Ù„Ø£Ø³Ø¹Ø§Ø±
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed m-0 font-sans">
                        Ø§Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø§Ù„Ø²Ø± Ù„ØªÙˆÙ„ÙŠØ¯ Ù…Ù„Ù Ù…Ø¶ØºÙˆØ· Ø¢Ù…Ù† Ø¹Ù„Ù‰ Ø³Ø·Ø­ Ø§Ù„Ù…ÙƒØªØ¨ ÙŠØ­ØªÙˆÙŠ Ø­ØµØ±Ø§Ù‹ Ø¹Ù„Ù‰ Ù…ÙˆØ§ØµÙØ§Øª Ø§Ù„Ø¬Ù‡Ø§Ø² Ø§Ù„ÙÙ†ÙŠØ© ÙˆØ³Ø¬Ù„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ù„Ù…Ø³Ø§Ø¹Ø¯Ø© Ø§Ù„Ù…Ù‡Ù†Ø¯Ø³ÙŠÙ† Ø¹Ù„Ù‰ Ø­Ù„ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© ÙÙˆØ±Ø§Ù‹.
                      </p>

                      {supportMessage && (
                        <div className="p-3 rounded-lg bg-white border border-emerald-300 text-xs text-slate-800 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-800">{supportMessage}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSupportMessage(null);
                                setSupportSavedPath(null);
                              }}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {supportSavedPath && (
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 p-1.5 rounded break-all" dir="ltr">
                              {supportSavedPath}
                            </span>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleCreateSupportBundle()}
                        disabled={supportLoading}
                        className="h-10 bg-[#006d41] hover:bg-[#005a36] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          {supportLoading
                            ? 'Ø¬Ø§Ø±ÙŠ Ø¬Ù…Ø¹ Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù… ÙˆØ¶ØºØ· Ø§Ù„Ø­Ø²Ù…Ø©...'
                            : 'ØªÙˆÙ„ÙŠØ¯ Ø­Ø²Ù…Ø© Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ Ø¹Ù„Ù‰ Ø³Ø·Ø­ Ø§Ù„Ù…ÙƒØªØ¨ Ø§Ù„Ø¢Ù†'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#f8fafc] border-t border-[#dce1dc] flex items-center justify-between text-xs text-slate-500 select-none shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">
              Ù†Ø¸Ø§Ù… Ø±ÙÙŠÙ‚ POS â€” ØªØµÙ…ÙŠÙ… Ù…ØµØ±ÙŠ Ù…Ø®ØµØµ Ù„Ù„Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª ÙˆÙ…Ø­Ù„Ø§Øª Ø§Ù„ØªØ¬Ø²Ø¦Ø©
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px]">Ù…Ø³Ø§Ø¹Ø¯Ø© F1</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-[#0f172a] font-bold text-xs transition-colors cursor-pointer"
            >
              Ø¥ØºÙ„Ø§Ù‚
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

