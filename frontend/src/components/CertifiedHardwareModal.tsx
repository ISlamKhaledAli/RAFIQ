import React, { useState } from 'react';
import {
  Server,
  Printer,
  Barcode,
  Coins,
  Scale,
  CheckCircle2,
  X,
  Search,
  Sliders,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';

interface CertifiedDevice {
  id: string;
  category: 'printer' | 'scanner' | 'drawer' | 'scale';
  model: string;
  brand: string;
  type: string;
  status: 'certified' | 'recommended';
  arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)' | 'Ø¬ÙŠØ¯ Ø¬Ø¯Ø§Ù‹ (Ø¹Ø¨Ø± ESC/POS)' | 'Ù‚ÙŠØ§Ø³ÙŠ';
  connectionType: 'USB' | 'USB + LAN' | 'RJ11' | 'Serial / USB';
  testResults: {
    latency: string;
    win7Compat: boolean;
    win10_11Compat: boolean;
    autoCutterOrTrigger: string;
  };
  setupSteps: string[];
  recommendedSettings: {
    paperOrCode?: string;
    driverName?: string;
    baudRateOrSuffix?: string;
    drawerCode?: string;
  };
  notes: string;
}

const CERTIFIED_DEVICES: CertifiedDevice[] = [
  // 1. RECEIPT PRINTERS
  {
    id: 'xp_n160ii',
    category: 'printer',
    model: 'XP-N160II / XP-Q200 / XP-C300H',
    brand: 'Xprinter',
    type: 'Ø·Ø§Ø¨Ø¹Ø© Ø¥ÙŠØµØ§Ù„Ø§Øª Ø­Ø±Ø§Ø±ÙŠØ© 80mm',
    status: 'recommended',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'USB + LAN',
    testResults: {
      latency: '< 150ms (ÙÙˆØ±ÙŠØ©)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ù‚Ø§Ø·Ø¹ Ø¢Ù„ÙŠ Ø³Ø±ÙŠØ¹ (Auto-Cutter)',
    },
    setupSteps: [
      'ØªÙˆØµÙŠÙ„ ÙƒØ§Ø¨Ù„ USB ÙˆØªØ´ØºÙŠÙ„ Ø§Ù„Ø·Ø§Ø¨Ø¹Ø©.',
      'ØªØ«Ø¨ÙŠØª Ø¯Ø±Ø§ÙŠÙØ± Xprinter Ø§Ù„Ø±Ø³Ù…ÙŠ Ù„Ù†Ø¸Ø§Ù… Windows (Ù…ØªÙˆÙØ± Ù„ÙˆÙŠÙ†Ø¯ÙˆØ² 7 Ø­ØªÙ‰ 11).',
      'ÙÙŠ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø±ÙÙŠÙ‚ > Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø­Ø±Ø§Ø±ÙŠØ©: Ø§Ø®ØªØ± Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© ÙˆÙ…Ù‚Ø§Ø³ 80mm.',
      'ØªÙØ¹ÙŠÙ„ Ø®ÙŠØ§Ø±ÙŠ "Ø·Ø¨Ø§Ø¹Ø© ÙÙˆØ±ÙŠØ©" Ùˆ "ÙØªØ­ Ø¯Ø±Ø¬ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹".',
      'Ø§Ù„Ø¶ØºØ· Ø¹Ù„Ù‰ "Ø·Ø¨Ø§Ø¹Ø© ØµÙØ­Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©" Ù„Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø®Ø±ÙˆØ¬ Ø§Ù„Ø¥ÙŠØµØ§Ù„ Ø¨Ø§Ù„Ù„ØºØ© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø§Ù„ÙˆØ§Ø¶Ø­Ø©.',
    ],
    recommendedSettings: {
      paperOrCode: '80mm (72mm printable area)',
      driverName: 'Xprinter 80 Series Driver',
      drawerCode: '27,112,0,25,250 (Ø£Ù…Ø± ÙØªØ­ Ø§Ù„Ø¯Ø±Ø¬ Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠ)',
    },
    notes: 'Ø£ÙƒØ«Ø± Ø·Ø§Ø¨Ø¹Ø§Øª Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù†ØªØ´Ø§Ø±Ø§Ù‹ ÙˆØ§Ù‚ØªØµØ§Ø¯ÙŠØ© ÙÙŠ Ù…ØµØ±ØŒ Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø± ÙˆØ±ÙˆÙ„Ø§Øª Ø§Ù„ÙˆØ±Ù‚ Ù…ØªÙˆÙØ±Ø© ÙÙŠ ÙƒÙ„ Ù…ÙƒØ§Ù†ØŒ ÙˆØ§Ø¹ØªÙ…Ø§Ø¯ÙŠØªÙ‡Ø§ Ù…Ù…ØªØ§Ø²Ø© Ù„Ù„Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª.',
  },
  {
    id: 'bixolon_srp330',
    category: 'printer',
    model: 'SRP-330II / SRP-350III',
    brand: 'Bixolon (Samsung)',
    type: 'Ø·Ø§Ø¨Ø¹Ø© Ø¥ÙŠØµØ§Ù„Ø§Øª Ø­Ø±Ø§Ø±ÙŠØ© Ù„Ù„Ù…Ù‡Ø§Ù… Ø§Ù„Ø´Ø§Ù‚Ø© 80mm',
    status: 'certified',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'USB',
    testResults: {
      latency: '< 100ms (ÙØ§Ø¦Ù‚Ø© Ø§Ù„Ø³Ø±Ø¹Ø©)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ù‚Ø§Ø·Ø¹ Ù‡ÙŠÙÙŠ Ø¯ÙŠÙˆØªÙŠ (2 Ù…Ù„ÙŠÙˆÙ† Ù‚Ø·ÙˆØ¹)',
    },
    setupSteps: [
      'ØªØ«Ø¨ÙŠØª Ø¯Ø±Ø§ÙŠÙØ± Bixolon Windows Driver v7.',
      'Ø§Ø®ØªÙŠØ§Ø± Ù…Ù‚Ø§Ø³ Ø§Ù„ÙˆØ±Ù‚ 80mm Ã— 297mm Ù…Ù† Ø®ØµØ§Ø¦Øµ Ø§Ù„Ø·Ø§Ø¨Ø¹Ø©.',
      'Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© ÙƒØ§ÙØªØ±Ø§Ø¶ÙŠØ© ÙÙŠ Ø±ÙÙŠÙ‚ POS ÙˆØ§Ø®ØªØ¨Ø§Ø± Ø§Ù„Ø·Ø¨Ø§Ø¹Ø© ÙˆØ§Ù„Ø¯Ø±Ø¬.',
    ],
    recommendedSettings: {
      paperOrCode: '80mm',
      driverName: 'Bixolon SRP-330II Driver',
      drawerCode: 'Standard ESC/POS Pulse Pin 2',
    },
    notes: 'Ø·Ø§Ø¨Ø¹Ø© ØµÙ†Ø§Ø¹ÙŠØ© Ù„Ù„Ù…Ø­Ù„Ø§Øª Ø§Ù„ÙƒØ¨ÙŠØ±Ø© ÙˆØ§Ù„Ù‡Ø§ÙŠØ¨Ø±Ù…Ø§Ø±ÙƒØªØŒ Ù…Ø­Ø±Ùƒ Ø·Ø¨Ø§Ø¹Ø© ØµØ§Ù…Øª Ø¬Ø¯Ø§Ù‹ ÙˆÙ…Ù‚Ø§ÙˆÙ… Ù„Ù„ØºØ¨Ø§Ø± ÙˆØ±Ø·ÙˆØ¨Ø© Ø§Ù„Ù…Ø­Ù„.',
  },
  {
    id: 'epson_tmt20',
    category: 'printer',
    model: 'TM-T20III / TM-T88VI',
    brand: 'Epson',
    type: 'Ø·Ø§Ø¨Ø¹Ø© ÙÙˆØ§ØªÙŠØ± Ù‚ÙŠØ§Ø³ÙŠØ© Ø¹Ø§Ù„Ù…ÙŠØ© 80mm',
    status: 'certified',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'USB',
    testResults: {
      latency: '< 120ms',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ù‚Ø§Ø·Ø¹ Ø¢Ù„ÙŠ Ø³ÙŠØ±Ø§Ù…ÙŠÙƒ',
    },
    setupSteps: [
      'ØªØ«Ø¨ÙŠØª Ø¨Ø±Ù†Ø§Ù…Ø¬ Epson Advanced Printer Driver (APD).',
      'Ø¶Ø¨Ø· Ø®Ø· Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø¹Ù„Ù‰ ÙˆØ¶Ø¹ TrueType Ù…Ø¹ Ù„ØºØ© Windows-1256.',
      'ØªØ¹ÙŠÙŠÙ†Ù‡Ø§ ÙƒØ·Ø§Ø¨Ø¹Ø© ÙÙˆØ§ØªÙŠØ± Ø§ÙØªØ±Ø§Ø¶ÙŠØ© ÙÙŠ Ø´Ø§Ø´Ø© Ø±ÙÙŠÙ‚ POS.',
    ],
    recommendedSettings: {
      paperOrCode: '80mm Roll',
      driverName: 'EPSON TM-T20III Receipt',
    },
    notes: 'Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø£Ø´Ù‡Ø± ÙÙŠ Ø³Ù„Ø§Ø³Ù„ Ø§Ù„Ù…ØªØ§Ø¬Ø± Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠØ©ØŒ Ø§Ø³ØªÙ‚Ø±Ø§Ø± Ø¹Ø§Ù„ÙŠ Ø¬Ø¯Ø§Ù‹ Ø¹Ù„Ù‰ Ù…Ø¯Ø§Ø± 24 Ø³Ø§Ø¹Ø© Ø¨Ø¯ÙˆÙ† Ø§Ù†Ù‚Ø·Ø§Ø¹.',
  },
  {
    id: 'mini_pos_58',
    category: 'printer',
    model: 'POS-58 Series / Milestone 58mm',
    brand: 'Generic / Milestone',
    type: 'Ø·Ø§Ø¨Ø¹Ø© ÙƒØ§Ø´ÙŠØ± Ù…Ø¯Ù…Ø¬Ø© 57mm / 58mm',
    status: 'certified',
    arabicSupport: 'Ø¬ÙŠØ¯ Ø¬Ø¯Ø§Ù‹ (Ø¹Ø¨Ø± ESC/POS)',
    connectionType: 'USB',
    testResults: {
      latency: '< 200ms',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'ØªÙ…Ø²ÙŠÙ‚ ÙŠØ¯ÙˆÙŠ (Manual Tear Bar)',
    },
    setupSteps: [
      'ØªØ«Ø¨ÙŠØª Ø¯Ø±Ø§ÙŠÙØ± POS-58 Series Driver.',
      'ÙÙŠ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø±ÙÙŠÙ‚ POS > Ø§Ø®ØªÙŠØ§Ø± Ù…Ù‚Ø§Ø³ Ø§Ù„ÙˆØ±Ù‚: 57mm (Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† 80mm).',
      'Ø¥Ù„ØºØ§Ø¡ ØªÙØ¹ÙŠÙ„ Ù‚Ø§Ø·Ø¹ Ø§Ù„ÙˆØ±Ù‚ Ø§Ù„Ø¢Ù„ÙŠ Ø¥Ù† Ù„Ù… ØªÙƒÙ† Ù…Ø²ÙˆØ¯Ø© Ø¨Ù‡.',
    ],
    recommendedSettings: {
      paperOrCode: '57mm / 58mm Roll',
      driverName: 'POS-58 Driver',
    },
    notes: 'Ù…Ø«Ø§Ù„ÙŠØ© Ù„Ù„Ø£ÙƒØ´Ø§Ùƒ ÙˆØ§Ù„Ù…Ø³Ø§Ø­Ø§Øª Ø§Ù„ØµØºÙŠØ±Ø© Ø­ÙŠØ« Ù„Ø§ ÙŠØªÙˆÙØ± Ù…ÙƒØ§Ù† Ù„Ø·Ø§Ø¨Ø¹Ø© 80mm Ø§Ù„ÙƒØ¨ÙŠØ±Ø©ØŒ ÙˆØªÙˆÙØ± Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ Ø§Ù„ÙˆØ±Ù‚.',
  },

  // 2. BARCODE SCANNERS
  {
    id: 'datalogic_qd2400',
    category: 'scanner',
    model: 'QuickScan QD2100 / QD2400 2D',
    brand: 'Datalogic',
    type: 'Ù‚Ø§Ø±Ø¦ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø³Ù„ÙƒÙŠ Ø¶ÙˆØ¦ÙŠ 1D & 2D QR',
    status: 'recommended',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'USB',
    testResults: {
      latency: '< 50ms (Ø§Ù„ØªÙ‚Ø§Ø· ÙÙˆØ±ÙŠ)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ø²Ø± Ø²Ù†Ø§Ø¯ Ù…Ø±ÙŠØ­ + ÙƒØ´Ù ØªÙ„Ù‚Ø§Ø¦ÙŠ Ø¹Ù„Ù‰ Ø§Ù„Ø­Ø§Ù…Ù„',
    },
    setupSteps: [
      'ØªÙˆØµÙŠÙ„ ÙƒØ§Ø¨Ù„ USB Ø¨Ø£ÙŠ Ù…Ù†ÙØ° ÙƒÙ…Ø¨ÙŠÙˆØªØ± (Plug & Play Ø¨Ø¯ÙˆÙ† ØªØ¹Ø±ÙŠÙØ§Øª).',
      'Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù† Ø§Ù„Ù‚Ø§Ø±Ø¦ ÙŠØµØ¯Ø± Ù†ØºÙ…Ø© ØªÙ†Ø¨ÙŠÙ‡ ØµÙˆØªÙŠØ© (Beep) Ø¹Ù†Ø¯ Ø§Ù„Ù…Ø³Ø­.',
      'Ù…Ø³Ø­ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø§Ù„Ø¨Ø±Ù…Ø¬Ø© "CR Suffix" Ù„Ø¥Ø±Ø³Ø§Ù„ Ø²Ø± Enter ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¨Ø¹Ø¯ ÙƒÙ„ Ù‚Ø±Ø§Ø¡Ø© ØµÙ†Ù.',
      'ÙÙŠ Ø´Ø§Ø´Ø© Ø§Ù„Ø¨ÙŠØ¹: Ù…Ø±Ø± Ø£ÙŠ ØµÙ†Ù ÙˆØ³ÙŠÙØ¶Ø§Ù ÙÙˆØ±Ø§Ù‹ Ù„Ù„Ø³Ù„Ø©.',
    ],
    recommendedSettings: {
      paperOrCode: 'Code 128, EAN-13, QR, DataMatrix',
      baudRateOrSuffix: 'USB HID Keyboard Emulation + CR (Enter)',
    },
    notes: 'Ø§Ù„Ù‚Ø§Ø±Ø¦ Ø§Ù„Ù…ÙˆØµÙ‰ Ø¨Ù‡ Ø±Ù‚Ù… 1 Ù„Ù…Ø´Ø±ÙˆØ¹ Ø±ÙÙŠÙ‚Ø› ÙŠØªÙ…ÙŠØ² Ø¨Ø¶ÙˆØ¡ Ø§Ø³ØªÙ‡Ø¯Ø§Ù Ù†Ø§Ø¹Ù…ØŒ ÙˆÙ‚Ø±Ø§Ø¡Ø© Ø³Ø±ÙŠØ¹Ø© Ù„Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ø¬Ø¹Ø¯Ø© Ø£Ùˆ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯Ø§Øª Ø§Ù„ØµØºÙŠØ±Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø­Ù„ÙˆÙ‰ ÙˆØ§Ù„Ù„Ø¨Ø§Ù†.',
  },
  {
    id: 'honeywell_1250g',
    category: 'scanner',
    model: 'Voyager 1250g / 1400g / 1450g 2D',
    brand: 'Honeywell',
    type: 'Ù‚Ø§Ø±Ø¦ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ù„ÙŠØ²Ø±ÙŠ Ø¹Ø§Ù„ÙŠ Ø§Ù„Ø­Ø³Ø§Ø³ÙŠØ©',
    status: 'certified',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'USB',
    testResults: {
      latency: '< 60ms',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ø­Ø§Ù…Ù„ ØªÙ„Ù‚Ø§Ø¦ÙŠ (Auto-Sense Stand)',
    },
    setupSteps: [
      'ØªÙˆØµÙŠÙ„ ÙƒØ§Ø¨Ù„ USB.',
      'ÙˆØ¶Ø¹ Ø§Ù„Ù‚Ø§Ø±Ø¦ Ø¹Ù„Ù‰ Ø§Ù„Ø­Ø§Ù…Ù„ Ù„ØªÙØ¹ÙŠÙ„ Ø§Ù„Ù…Ø³Ø­ Ø§Ù„Ù…Ø³ØªÙ…Ø± Ø¯ÙˆÙ† Ù„Ù…Ø³ Ø§Ù„Ø²Ù†Ø§Ø¯.',
      'ØªØ£ÙƒØ¯ Ù…Ù† Ø¥Ø±Ø³Ø§Ù„ Enter Ø¨Ù†Ù‡Ø§ÙŠØ© ÙƒÙ„ Ø¨Ø§Ø±ÙƒÙˆØ¯ Ù…Ù† Ø®Ù„Ø§Ù„ Ø¨Ø§Ø±ÙƒÙˆØ¯Ø§Øª ÙƒØªØ§Ù„ÙˆØ¬ Honeywell.',
    ],
    recommendedSettings: {
      baudRateOrSuffix: 'USB Keyboard PC + Carriage Return',
    },
    notes: 'Ù‚Ø¯Ø±Ø© ÙØ§Ø¦Ù‚Ø© Ø¹Ù„Ù‰ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯Ø§Øª Ø§Ù„Ø¨Ø§Ù‡ØªØ© ÙˆØ§Ù„Ù…Ø·Ø¨ÙˆØ¹Ø© Ø¨Ø¬ÙˆØ¯Ø© Ù…Ù†Ø®ÙØ¶Ø© Ù…Ù† Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†.',
  },
  {
    id: 'zebra_ds9208',
    category: 'scanner',
    model: 'DS9208 / DS9308 Desktop Omnidirectional',
    brand: 'Zebra (Symbol)',
    type: 'Ù‚Ø§Ø±Ø¦ Ø·Ø§ÙˆÙ„Ø© Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø²ÙˆØ§ÙŠØ§ (Ø´ØºÙ„ Ø«Ù‚ÙŠÙ„ ÙƒØ§Ø´ÙŠØ±)',
    status: 'recommended',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'USB',
    testResults: {
      latency: '< 30ms (ÙØ§Ø¦Ù‚ Ø§Ù„Ø³Ø±Ø¹Ø©)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ù…Ø³Ø­ Ù…Ø³ØªÙ…Ø± 360 Ø¯Ø±Ø¬Ø© Ø¨Ø¯ÙˆÙ† Ø²Ù†Ø§Ø¯',
    },
    setupSteps: [
      'ØªØ«Ø¨ÙŠØª Ø§Ù„Ù‚Ø§Ø±Ø¦ Ø¹Ù„Ù‰ Ø·Ø§ÙˆÙ„Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ± ÙˆØªÙˆØµÙŠÙ„ ÙƒØ§Ø¨Ù„ USB.',
      'Ù„Ø§ ÙŠØ­ØªØ§Ø¬ ØªÙˆØ¬ÙŠÙ‡ Ù…Ø­Ø¯Ø¯Ø› Ø¨Ù…Ø¬Ø±Ø¯ ØªÙ…Ø±ÙŠØ± Ø§Ù„Ù…Ù†ØªØ¬ Ø£Ù…Ø§Ù…Ù‡ ÙŠÙ‚Ø±Ø£ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ù…Ù† Ø£ÙŠ Ø²Ø§ÙˆÙŠØ©.',
    ],
    recommendedSettings: {
      baudRateOrSuffix: 'USB HID + Auto-Enter',
    },
    notes: 'Ø§Ù„Ø®ÙŠØ§Ø± Ø§Ù„Ø£ÙØ¶Ù„ Ù„Ù„Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª Ø§Ù„Ù…Ø²Ø¯Ø­Ù…Ø› ÙŠØ±ÙØ¹ Ø³Ø±Ø¹Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ø¨Ù†Ø³Ø¨Ø© 40% Ù„Ø¹Ø¯Ù… Ø§Ù„Ø­Ø§Ø¬Ø© Ù„Ø±ÙØ¹ Ø§Ù„Ù…Ø³Ø¯Ø³ Ø§Ù„ÙŠØ¯ÙˆÙŠ.',
  },

  // 3. CASH DRAWERS
  {
    id: 'cash_drawer_standard',
    category: 'drawer',
    model: 'MK-410 / E-410 Heavy Duty Metal Drawer',
    brand: 'Maken / POS-D',
    type: 'Ø¯Ø±Ø¬ Ù†Ù‚Ø¯ÙŠØ© Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ Ø­Ø¯ÙŠØ¯ÙŠ 5 Ø®Ø§Ù†Ø§Øª Ù†Ù‚Ø¯ÙŠØ© Ùˆ 8 ÙÙƒØ©',
    status: 'certified',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'RJ11',
    testResults: {
      latency: '< 50ms (ÙØªØ­ ÙÙˆØ±ÙŠ Ù…Ø¹ Ø£Ù…Ø± Ø§Ù„Ø·Ø¨Ø§Ø¹Ø©)',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ù…Ù„Ù Ù…ØºÙ†Ø§Ø·ÙŠØ³ÙŠ 24V / 12V',
    },
    setupSteps: [
      'ØªÙˆØµÙŠÙ„ ÙƒØ§Ø¨Ù„ RJ11 Ø§Ù„Ù…Ø²ÙˆØ¯ Ù…Ø¹ Ø§Ù„Ø¯Ø±Ø¬ Ø¨Ù…Ù†ÙØ° (DK / Cash Drawer) Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ Ø¸Ù‡Ø± Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„ÙÙˆØ§ØªÙŠØ±.',
      'ÙÙŠ Ø´Ø§Ø´Ø© Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø¨Ø±ÙÙŠÙ‚ POS > Ø§Ù„Ø·Ø§Ø¨Ø¹Ø© Ø§Ù„Ø­Ø±Ø§Ø±ÙŠØ©: ÙØ¹Ù‘Ù„ Ø®ÙŠØ§Ø± "ÙØªØ­ Ø¯Ø±Ø¬ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹".',
      'Ø¹Ù†Ø¯ Ø§Ù„Ø¶ØºØ· Ø¹Ù„Ù‰ "Ø·Ø¨Ø§Ø¹Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©" Ø£Ùˆ Ø¥Ù†Ù‡Ø§Ø¡ Ø£ÙŠ Ø¹Ù…Ù„ÙŠØ© Ø¨ÙŠØ¹ØŒ Ø³ÙŠÙÙØªØ­ Ø§Ù„Ø¯Ø±Ø¬ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¨ØµÙˆØª Ù†Ø§Ø¹Ù….',
    ],
    recommendedSettings: {
      drawerCode: 'ESC p 0 25 250 (Pin 2 / 24V)',
    },
    notes: 'Ù‡ÙŠÙƒÙ„ Ø­Ø¯ÙŠØ¯ÙŠ ØµÙ„Ø¨ Ù…Ø¹ Ù…ÙØªØ§Ø­ Ø£Ù…Ø§Ù† Ø«Ù„Ø§Ø«ÙŠ Ø§Ù„Ø£ÙˆØ¶Ø§Ø¹ (Ù‚ÙÙ„ / ÙØªØ­ Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ / ÙØªØ­ ÙŠØ¯ÙˆÙŠ Ø¨Ø§Ù„Ø·ÙˆØ§Ø±Ø¦).',
  },

  // 4. BARCODE SCALES
  {
    id: 'aclas_scale',
    category: 'scale',
    model: 'Aclas LS2X / Rongta RLS1000 / CAS CL5200',
    brand: 'Aclas / Rongta / CAS',
    type: 'Ù…ÙŠØ²Ø§Ù† Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ Ù„Ù„Ø£Ø¬Ø¨Ø§Ù† ÙˆØ§Ù„Ø®Ø¶Ø±ÙˆØ§Øª ÙˆØ§Ù„Ù„Ø­ÙˆÙ…',
    status: 'certified',
    arabicSupport: 'Ù…Ù…ØªØ§Ø² (Ù…Ø¯Ù…Ø¬ Ø¨Ø¯ÙˆÙ† ØªØ´ÙˆÙŠÙ‡)',
    connectionType: 'Serial / USB',
    testResults: {
      latency: '< 80ms Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ù„ÙˆØ²Ù† ÙˆØ§Ù„Ø³Ø¹Ø±',
      win7Compat: true,
      win10_11Compat: true,
      autoCutterOrTrigger: 'Ø·Ø¨Ø§Ø¹Ø© Ù…Ù„ØµÙ‚ Ø¨Ø§Ø±ÙƒÙˆØ¯ ÙÙˆØ±ÙŠ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙŠØ²Ø§Ù†',
    },
    setupSteps: [
      'Ø¶Ø¨Ø· ØµÙŠØºØ© Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ ÙÙŠ Ø§Ù„Ù…ÙŠØ²Ø§Ù† Ù„ØªÙƒÙˆÙ† ØµÙŠØºØ© Ù‚ÙŠØ§Ø³ÙŠØ© EAN-13 ØªØ¨Ø¯Ø£ Ø¨Ù€ 20 Ø£Ùˆ 21 (Ø§Ù„Ù†ÙˆØ¹ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯ Ù„Ù„Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª).',
      'ØªÙƒÙˆÙŠØ¯ Ø§Ù„ØµÙ†Ù ÙÙŠ Ø±ÙÙŠÙ‚ Ø¨Ù†ÙØ³ ÙƒÙˆØ¯ Ø§Ù„Ù€ PLU Ø§Ù„Ù…Ø­Ø¯Ø¯ ÙÙŠ Ø§Ù„Ù…ÙŠØ²Ø§Ù† ÙˆØ§Ø®ØªÙŠØ§Ø± Ø§Ù„ÙˆØ­Ø¯Ø© (ÙƒÙŠÙ„ÙˆØ¬Ø±Ø§Ù…).',
      'Ø¹Ù†Ø¯ ØªÙ…Ø±ÙŠØ± Ù…Ù„ØµÙ‚ Ø§Ù„Ù…ÙŠØ²Ø§Ù† Ø£Ù…Ø§Ù… Ø§Ù„ÙƒØ§Ø´ÙŠØ±ØŒ ÙŠØ³ØªØ®Ø±Ø¬ Ø±ÙÙŠÙ‚ ÙˆØ²Ù† Ø§Ù„Ø¬Ø±Ø§Ù…Ø§Øª ÙˆÙŠØ­Ø³Ø¨ Ø§Ù„Ø³Ø¹Ø± ÙÙˆØ±Ø§Ù‹ Ø¨Ø¯Ù‚Ø© Ø§Ù„Ù‚Ø±ÙˆØ´.',
    ],
    recommendedSettings: {
      paperOrCode: 'EAN-13 Scale Barcode (20-XXXX-WWWWW-C)',
    },
    notes: 'Ù…ØªÙˆØ§ÙÙ‚ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ù…Ø¹ Ø®ÙˆØ§Ø±Ø²Ù…ÙŠØ© ÙÙƒ Ø´ÙØ±Ø§Øª Ø§Ù„Ù…ÙˆØ§Ø²ÙŠÙ† Ø§Ù„Ù…Ø¯Ù…Ø¬Ø© ÙÙŠ Ø±ÙÙŠÙ‚ POS Ø¯ÙˆÙ† Ø§Ù„Ø­Ø§Ø¬Ø© Ù„Ø£ÙŠ Ø¨Ø±Ø§Ù…Ø¬ ÙˆØ³ÙŠØ·Ø©.',
  },
];

interface CertifiedHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: 'all' | 'printer' | 'scanner' | 'drawer' | 'scale';
}

export const CertifiedHardwareModal: React.FC<CertifiedHardwareModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'all',
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'printer' | 'scanner' | 'drawer' | 'scale'>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredDevices = CERTIFIED_DEVICES.filter((d) => {
    const matchesCat = activeCategory === 'all' || d.category === activeCategory;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchesCat;

    const matchesSearch =
      d.model.toLowerCase().includes(q) ||
      d.brand.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.notes.toLowerCase().includes(q);

    return matchesCat && matchesSearch;
  });

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div
        className="w-full max-w-4xl h-[86vh] max-h-[800px] bg-white rounded-2xl shadow-2xl border border-[#dce1dc] flex flex-col overflow-hidden font-sans text-[#0f172a]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#00372d] text-white flex items-center justify-between shrink-0 select-none shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#006d41] flex items-center justify-center text-white shadow-inner">
              <Server className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø£Ø¬Ù‡Ø²Ø© ÙˆØ§Ù„Ø¹ØªØ§Ø¯ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯ ÙˆØ§Ù„Ù…Ø¬Ø±Ù‘Ø¨ (Hardware Matrix)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  ÙÙŠØªØ´Ø± #141
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/80 m-0">
                Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø·Ø§Ø¨Ø¹Ø§ØªØŒ Ù‚Ø§Ø±Ø¦Ø§Øª Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ØŒ Ø£Ø¯Ø±Ø§Ø¬ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©ØŒ ÙˆØ§Ù„Ù…ÙˆØ§Ø²ÙŠÙ† Ø§Ù„Ù…Ø¬Ø±Ø¨Ø© Ù…Ø¹ Ø·Ø±ÙŠÙ‚Ø© Ø¥Ø¹Ø¯Ø§Ø¯ ÙƒÙ„ Ø¬Ù‡Ø§Ø²
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Ø¥ØºÙ„Ø§Ù‚ (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar & Search */}
        <div className="p-3 bg-[#f8fafc] border-b border-[#dce1dc] flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 bg-[#edf2ee] p-1 rounded-xl border border-[#dce1dc] text-xs">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              Ø§Ù„ÙƒÙ„ ({CERTIFIED_DEVICES.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('printer')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'printer'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Ø§Ù„Ø·Ø§Ø¨Ø¹Ø§Øª Ø§Ù„Ø­Ø±Ø§Ø±ÙŠØ©</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('scanner')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'scanner'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>Ù‚Ø§Ø±Ø¦Ø§Øª Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('drawer')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'drawer'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Ø£Ø¯Ø±Ø§Ø¬ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('scale')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'scale'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:text-[#0f172a]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Ù…ÙˆØ§Ø²ÙŠÙ† Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯</span>
            </button>
          </div>

          {/* Quick search input */}
          <div className="relative w-64 max-w-full">
            <Search className="w-3.5 h-3.5 text-[#52605d] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ø§Ø¨Ø­Ø« Ø¨Ù…ÙˆØ¯ÙŠÙ„ Ø£Ùˆ Ù…Ø§Ø±ÙƒØ© Ø§Ù„Ø¬Ù‡Ø§Ø²..."
              className="w-full h-8.5 pr-8.5 pl-3 rounded-lg bg-white border border-[#dce1dc] focus:border-[#006d41] focus:ring-1 focus:ring-[#006d41] text-xs text-[#0f172a] placeholder-[#52605d]/60 outline-hidden transition-all"
            />
          </div>
        </div>

        {/* Device Cards List */}
        <div className="flex-1 p-4 overflow-y-auto bg-white flex flex-col gap-3 min-h-0">
          {/* Advice Banner */}
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Ø¶Ù…Ø§Ù† Ø§Ù„ØªÙˆØ§ÙÙ‚ Ø§Ù„ØªØ§Ù…:</strong> Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø¬Ù‡Ø²Ø© ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ø®Ø¶Ø¹Øª Ù„Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ù…ÙŠØ¯Ø§Ù†ÙŠØ© ÙØ¹Ù„ÙŠØ© Ù„Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø§Ø³ØªØ¬Ø§Ø¨ØªÙ‡Ø§ Ø§Ù„ÙÙˆØ±ÙŠØ© Ø¹Ù„Ù‰ ÙƒØ§ÙØ© Ø¥ØµØ¯Ø§Ø±Ø§Øª Ø§Ù„ÙˆÙŠÙ†Ø¯ÙˆØ² (ÙˆÙŠÙ†Ø¯ÙˆØ² 7 Ùˆ 8 Ùˆ 10 Ùˆ 11) ÙˆØ¯Ø¹Ù…Ù‡Ø§ Ø§Ù„ÙƒØ§Ù…Ù„ Ù„Ù„ØºØ© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©.
              </span>
            </div>
            <span className="text-[10px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300 shrink-0">
              100% Plug & Play
            </span>
          </div>

          {filteredDevices.map((device) => {
            const isExpanded = expandedDeviceId === device.id;
            return (
              <div
                key={device.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isExpanded
                    ? 'border-[#006d41] bg-white shadow-sm'
                    : 'border-[#dce1dc] bg-[#f8fafc] hover:border-slate-400'
                }`}
              >
                {/* Header row */}
                <div
                  onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#dce1dc] flex items-center justify-center text-[#006d41] shadow-2xs shrink-0">
                      {device.category === 'printer' && <Printer className="w-5 h-5" />}
                      {device.category === 'scanner' && <Barcode className="w-5 h-5" />}
                      {device.category === 'drawer' && <Coins className="w-5 h-5" />}
                      {device.category === 'scale' && <Scale className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-[#0f172a] truncate">
                          {device.brand} â€” {device.model}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-md bg-emerald-100 text-[#006d41] border border-emerald-200">
                          {device.type}
                        </span>
                        {device.status === 'recommended' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            Ù…ÙˆØµÙ‰ Ø¨Ù‡ Ù„Ù„Ø³ÙˆØ¨Ø±Ù…Ø§Ø±ÙƒØª
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate m-0 mt-0.5">
                        {device.notes}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium text-slate-600">
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#dce1dc]">
                        {device.connectionType}
                      </span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {device.testResults.latency}
                      </span>
                    </div>

                    <span className="text-slate-400">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#006d41]" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </div>

                {/* Expanded details & setup checklist */}
                {isExpanded && (
                  <div className="p-4 border-t border-[#dce1dc] bg-white flex flex-col gap-4 text-xs animate-in slide-in-from-top-1 duration-150">
                    {/* Test Results Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Ø³Ø±Ø¹Ø© Ø§Ù„Ø§Ø³ØªØ¬Ø§Ø¨Ø©</span>
                        <span className="font-bold text-[#006d41]">{device.testResults.latency}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Ø¯Ø¹Ù… Ø§Ù„Ù„ØºØ© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©</span>
                        <span className="font-bold text-[#0f172a]">{device.arabicSupport}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">ÙˆÙŠÙ†Ø¯ÙˆØ² 7 Ùˆ 8 Ùˆ 10 Ùˆ 11</span>
                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ù…ØªÙˆØ§ÙÙ‚ ÙˆÙ…Ø¬Ø±Ù‘Ø¨ 100%</span>
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#dce1dc]">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Ø§Ù„Ù‚Ø§Ø·Ø¹ / Ø§Ù„Ø²Ù†Ø§Ø¯</span>
                        <span className="font-bold text-[#0f172a] truncate block">
                          {device.testResults.autoCutterOrTrigger}
                        </span>
                      </div>
                    </div>

                    {/* Step by Step Setup Sheet */}
                    <div className="flex flex-col gap-2">
                      <span className="font-bold text-xs text-[#00372d] flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-[#006d41]" />
                        <span>ÙˆØ±Ù‚Ø© Ø¥Ø¹Ø¯Ø§Ø¯ ÙˆØªØ´ØºÙŠÙ„ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø² ÙÙŠ Ø±ÙÙŠÙ‚ POS:</span>
                      </span>

                      <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce1dc] flex flex-col gap-1.5">
                        {device.setupSteps.map((step, sIdx) => (
                          <div key={sIdx} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="w-4 h-4 rounded-full bg-[#00372d] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {sIdx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommended Driver & Commands */}
                    {device.recommendedSettings && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-700">
                        {device.recommendedSettings.driverName && (
                          <div>
                            <span className="text-[10px] text-slate-500 block">Ø§Ø³Ù… Ø§Ù„ØªØ¹Ø±ÙŠÙ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯:</span>
                            <strong className="font-mono text-[#00372d]">{device.recommendedSettings.driverName}</strong>
                          </div>
                        )}
                        {device.recommendedSettings.paperOrCode && (
                          <div>
                            <span className="text-[10px] text-slate-500 block">Ø§Ù„Ù…Ù‚Ø§Ø³ / Ø§Ù„Ø´ÙØ±Ø©:</span>
                            <strong className="font-mono text-[#00372d]">{device.recommendedSettings.paperOrCode}</strong>
                          </div>
                        )}
                        {device.recommendedSettings.drawerCode && (
                          <div>
                            <span className="text-[10px] text-slate-500 block">Ø£Ù…Ø± ÙØªØ­ Ø§Ù„Ø¯Ø±Ø¬:</span>
                            <strong className="font-mono text-emerald-800">{device.recommendedSettings.drawerCode}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#f8fafc] border-t border-[#dce1dc] flex items-center justify-between text-xs text-slate-500 select-none shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-700" />
            <span>
              ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¹Ø·Ø§Ø¡ Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø© Ù„Ù…Ø­Ù„ Ø¨ÙŠØ¹ Ø£Ø¬Ù‡Ø²Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ± Ù„ØªØ¬Ù‡ÙŠØ² Ø§Ù„Ø£Ø¬Ù‡Ø²Ø© Ø§Ù„Ù…ØªÙˆØ§ÙÙ‚Ø© Ù…Ø¨Ø§Ø´Ø±Ø©.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#dce1dc] text-[#0f172a] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#006d41]" />
              <span>Ø·Ø¨Ø§Ø¹Ø© ÙˆØ±Ù‚Ø© Ø§Ù„Ù…ÙˆØ§ØµÙØ§Øª</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#00372d] hover:bg-[#004d3f] text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Ø¥ØºÙ„Ø§Ù‚
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

