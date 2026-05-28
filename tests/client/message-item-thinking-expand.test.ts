// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// --- Hoisted mocks (evaluated before imports, in the same frame) ---

const mockSettingsStore = vi.hoisted(() => ({
  display: { show_reasoning: true },
  updateLocal: vi.fn(),
}))

const mockChatStore = vi.hoisted(() => ({
  getThinkingObservation: vi.fn(() => null),
  getSessionId: vi.fn(() => 'session-1'),
}))

// --- Module mocks ---

vi.mock('@/stores/hermes/settings', () => ({
  useSettingsStore: () => mockSettingsStore,
}))

vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => mockChatStore,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<any>('naive-ui')
  return {
    ...actual,
    useMessage: () => ({
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useSpeech', () => ({
  useGlobalSpeech: () => ({
    isSupported: false,
    isPlaying: { value: false },
    isPaused: { value: false },
    currentMessageId: { value: null },
    progress: { value: 0 },
    engine: { value: null },
    isCustomPlaying: { value: false },
    isCustomPaused: { value: false },
    currentCustomMessageId: { value: null },
    isPlayingThisMessage: false,
    isPausedThisMessage: false,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    enqueue: vi.fn(),
    getDefaultVoice: vi.fn(),
    extractReadableText: vi.fn(() => ''),
    openaiPlay: vi.fn(),
    openaiToggle: vi.fn(),
    mimoPlay: vi.fn(),
    mimoToggle: vi.fn(),
    speakViaBrowser: vi.fn(),
  }),
}))

// --- Imports ---

import MessageItem from '@/components/hermes/chat/MessageItem.vue'
import type { Message } from '@/stores/hermes/chat'

// --- Helpers ---

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: false,
    ...overrides,
  }
}

// --- Tests ---

describe('thinking block expansion — show_reasoning setting', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Default: reasoning display is ENABLED
    mockSettingsStore.display.show_reasoning = true
    mockChatStore.getThinkingObservation = vi.fn(() => null)
  })

  // ── BUG REPRODUCTION ──────────────────────────────────────────────

  it('BUG #951: with show_reasoning=false, thinking block does NOT appear during streaming', () => {
    // Arrange: user has disabled reasoning display
    mockSettingsStore.display.show_reasoning = false

    // streaming message with partial <think> tag (thinking in progress)
    const msg = makeMessage({
      id: 'stream-1',
      content: '<think>thinking...',
      isStreaming: true,
    })

    const wrapper = mount(MessageItem, { props: { message: msg } })

    // Assert: thinking block must NOT be rendered when show_reasoning is false
    // This is the core bug — the original code forces it open whenever streaming.
    expect(wrapper.find('.thinking-block').exists()).toBe(false)
  })

  it('BUG #951: with show_reasoning=false + reasoning field, thinking block does NOT appear during streaming', () => {
    mockSettingsStore.display.show_reasoning = false

    // reasoning field (event-based thinking from Hermes)
    const msg = makeMessage({
      id: 'stream-r1',
      content: '',          // no <think> tags
      reasoning: 'thinking...',
      isStreaming: true,
    })

    const wrapper = mount(MessageItem, { props: { message: msg } })

    expect(wrapper.find('.thinking-block').exists()).toBe(false)
  })

  // ── EXPECTED BEHAVIOURS ───────────────────────────────────────────

  it('with show_reasoning=true, streaming thinking content expands automatically', () => {
    mockSettingsStore.display.show_reasoning = true

    const msg = makeMessage({
      id: 'stream-2',
      content: '<think>thinking in progress...',
      isStreaming: true,
    })

    const wrapper = mount(MessageItem, { props: { message: msg } })

    const block = wrapper.find('.thinking-block')
    expect(block.exists()).toBe(true)
  })

  it('with show_reasoning=false, completed (non-streaming) thinking is not rendered in DOM', () => {
    mockSettingsStore.display.show_reasoning = false

    const msg = makeMessage({
      id: 'done-1',
      content: '<think>already done</think>',
      isStreaming: false,
    })

    const wrapper = mount(MessageItem, { props: { message: msg } })

    // After fix: thinking-block is not rendered at all when show_reasoning=false
    expect(wrapper.find('.thinking-block').exists()).toBe(false)
  })

  it('with show_reasoning=true, completed (non-streaming) thinking is shown expanded', () => {
    mockSettingsStore.display.show_reasoning = true

    const msg = makeMessage({
      id: 'done-2',
      content: '<think>already done</think>',
      isStreaming: false,
    })

    const wrapper = mount(MessageItem, { props: { message: msg } })

    const block = wrapper.find('.thinking-block')
    expect(block.exists()).toBe(true)
    expect(block.classes()).toContain('expanded')
  })

  it('show_reasoning=false: thinking block is not rendered at all, no toggle possible', () => {
    mockSettingsStore.display.show_reasoning = false

    const msg = makeMessage({
      id: 'stream-3',
      content: '<think>thinking...',
      isStreaming: true,
    })

    const wrapper = mount(MessageItem, { props: { message: msg } })

    // The thinking block is not rendered at all when show_reasoning=false.
    // This is the correct behaviour — the user explicitly chose not to see reasoning.
    expect(wrapper.find('.thinking-block').exists()).toBe(false)
  })
})
