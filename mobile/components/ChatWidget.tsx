import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp, FadeOutUp, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { apiRequest } from '@/api/client';
import { TypingIndicator } from './TypingIndicator';
import { useColorScheme } from './useColorScheme';

type Message = { id: string; role: 'user' | 'bot'; content: string };
type ChatResponse = { success: boolean; reply: string };

const QUICK_PROMPTS = [
  'How do I book an appointment?',
  'Reset my password',
  'How do I view my records?',
];

const SCREEN_HEIGHT = Dimensions.get('window').height;

function TypingBubble({ isDark }: { isDark: boolean }) {
  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18)}
      exiting={FadeOutUp.springify()}
      style={[styles.messageRow, styles.messageRowBot]}
    >
      <View style={styles.botAvatar}>
        <MaterialCommunityIcons name="robot-outline" size={15} color="#14b8a6" />
      </View>
      <View
        style={[styles.bubble, styles.bubbleBot, { backgroundColor: isDark ? '#1e293b' : '#e9f0f0' }]}
      >
        <TypingIndicator />
      </View>
    </Animated.View>
  );
}

export function ChatWidget() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const listRef = useRef<FlashList<Message>>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const tabBarHeight = 56 + insets.bottom;
  const fabBottom = tabBarHeight + 16;
  const sheetHeight = SCREEN_HEIGHT * 0.7;

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const surfaceBg = isDark ? '#1e293b' : '#ffffff';
  const borderColor = isDark ? '#1e293b' : '#e2e8f0';
  const textPrimary = isDark ? '#e2e8f0' : '#0f172a';
  const textMuted = isDark ? '#64748b' : '#94a3b8';

  // ── Scroll ──────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (loading) scrollToBottom();
  }, [loading, scrollToBottom]);

  // ── Actions ─────────────────────────────────────────────────
  const openChat = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setMessages(prev => [...prev, { id: `${Date.now()}-user`, role: 'user', content: msg }]);
      setInput('');
      setLoading(true);

      try {
        const data = await apiRequest<ChatResponse>('/api/chat', {
          method: 'POST',
          body: { message: msg },
        });
        setMessages(prev => [
          ...prev,
          { id: `${Date.now()}-bot`, role: 'bot', content: data.reply || 'No response available.' },
        ]);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setMessages(prev => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            role: 'bot',
            content: 'Unable to reach the assistant. Please check your connection.',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading]
  );

  // ── Message renderer ────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === 'user';
      return (
        <Animated.View
          entering={FadeInUp.springify().damping(18).stiffness(140)}
          style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowBot]}
        >
          {!isUser && (
            <View style={styles.botAvatar}>
              <MaterialCommunityIcons name="robot-outline" size={15} color="#14b8a6" />
            </View>
          )}
          {isUser ? (
            <LinearGradient
              colors={['#14b8a6', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleUser]}
            >
              <Text style={styles.bubbleTextUser}>{item.content}</Text>
            </LinearGradient>
          ) : (
            <View
              style={[styles.bubble, styles.bubbleBot, { backgroundColor: isDark ? '#1e293b' : '#e9f0f0' }]}
            >
              <Text style={[styles.bubbleTextBot, { color: textPrimary }]}>{item.content}</Text>
            </View>
          )}
        </Animated.View>
      );
    },
    [isDark, textPrimary]
  );

  // ── Empty state ─────────────────────────────────────────────
  const EmptyState = useMemo(
    () => (
      <View style={styles.emptyState}>
        <LinearGradient
          colors={['#14b8a6', '#0d9488']}
          style={styles.emptyIconRing}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <MaterialCommunityIcons name="chat-processing-outline" size={30} color="#fff" />
        </LinearGradient>
        <Text style={[styles.emptyTitle, { color: textPrimary }]}>How can I help you?</Text>
        <Text style={[styles.emptySubtitle, { color: textMuted }]}>
          Ask about appointments, records, or your account
        </Text>
        <View style={styles.promptsContainer}>
          {QUICK_PROMPTS.map(prompt => (
            <Pressable
              key={prompt}
              onPress={() => sendMessage(prompt)}
              style={({ pressed }) => [
                styles.promptChip,
                {
                  backgroundColor: isDark ? '#1e293b' : '#e2f4f3',
                  borderColor: isDark ? '#334155' : '#b2dada',
                },
                pressed && styles.promptChipActive,
              ]}
            >
              <MaterialCommunityIcons name="arrow-right-circle-outline" size={15} color="#14b8a6" />
              <Text style={styles.promptChipText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ),
    [isDark, textPrimary, textMuted, sendMessage]
  );

  const canSend = !loading && input.trim().length > 0;

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
      {/* FAB */}
      {!isOpen && (
        <Animated.View
          entering={ZoomIn.springify().damping(16)}
          exiting={ZoomOut.springify().damping(16)}
          style={[styles.fabWrap, { bottom: fabBottom }]}
        >
          <Pressable
            onPress={openChat}
            style={({ pressed }) => [styles.fabPressable, pressed && styles.fabPressed]}
            accessibilityLabel="Open Vytara Assistant"
            accessibilityRole="button"
          >
            <LinearGradient
              colors={['#1ec8b4', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              <MaterialCommunityIcons name="chat-outline" size={26} color="#fff" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {/* Chat panel — full-screen overlay with backdrop */}
      {isOpen && (
        <Animated.View
          entering={FadeInUp.duration(250)}
          style={StyleSheet.absoluteFill}
        >
          {/* Backdrop */}
          <Pressable style={styles.backdrop} onPress={closeChat} />

          {/* Sheet */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[
              styles.sheet,
              {
                height: sheetHeight,
                backgroundColor: bg,
              },
            ]}
          >
            {/* Drag pill */}
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: isDark ? '#334155' : '#c8d6d9' }]} />
            </View>

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <View style={styles.headerLeft}>
                <LinearGradient
                  colors={['#14b8a6', '#0d9488']}
                  style={styles.headerIconWrap}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <MaterialCommunityIcons name="robot-outline" size={20} color="#fff" />
                </LinearGradient>
                <View>
                  <Text style={[styles.headerTitle, { color: textPrimary }]}>Vytara Assistant</Text>
                  <Text style={styles.headerSubtitle}>Healthcare Support</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                {messages.length > 0 && (
                  <Pressable
                    onPress={() => setMessages([])}
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnActive]}
                    accessibilityLabel="Clear chat"
                  >
                    <MaterialCommunityIcons name="delete-sweep-outline" size={20} color={textMuted} />
                  </Pressable>
                )}
                <Pressable
                  onPress={closeChat}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnActive]}
                  accessibilityLabel="Close assistant"
                >
                  <MaterialCommunityIcons name="close" size={20} color={textMuted} />
                </Pressable>
              </View>
            </View>

            {/* Messages — flex:1 fills the space between header and input */}
            <FlashList<Message>
              ref={listRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              ListEmptyComponent={EmptyState}
              ListFooterComponent={loading ? <TypingBubble isDark={isDark} /> : null}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              estimatedItemSize={80}
            />

            {/* Input bar — sits below the FlatList, above keyboard */}
            <View style={[styles.inputBar, { borderTopColor: borderColor }]}>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: surfaceBg,
                    color: textPrimary,
                    borderColor: isDark ? '#334155' : '#c8d6d9',
                  },
                ]}
                placeholder="Ask about records, care, or appointments…"
                placeholderTextColor={textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (canSend) sendMessage();
                }}
              />
              <Pressable
                onPress={() => sendMessage()}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendBtn,
                  pressed && styles.sendBtnPressed,
                  !canSend && styles.sendBtnDisabled,
                ]}
                accessibilityLabel="Send message"
              >
                <MaterialCommunityIcons
                  name={loading ? 'dots-horizontal' : 'send'}
                  size={20}
                  color={canSend ? '#fff' : textMuted}
                />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // ── FAB ──────────────────────────────────────────────────────
  fabWrap: {
    position: 'absolute',
    right: 20,
    zIndex: 9999,
  },
  fabPressable: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  fabPressed: {
    transform: [{ scale: 0.93 }],
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0d9488',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },

  // ── Overlay ──────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
  },

  // ── Pill ─────────────────────────────────────────────────────
  pillRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },

  // ── Header ───────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#14b8a6',
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(100,116,139,0.12)',
  },

  // ── Messages ─────────────────────────────────────────────────
  messagesWrap: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowBot: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20,184,166,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    borderBottomLeftRadius: 4,
  },
  bubbleTextUser: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  bubbleTextBot: {
    fontSize: 15,
    lineHeight: 22,
  },

  // ── Empty state ──────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingTop: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  promptsContainer: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
  },
  promptChipActive: {
    opacity: 0.72,
  },
  promptChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#14b8a6',
    flex: 1,
  },

  // ── Input bar ────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#14b8a6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0d9488',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    flexShrink: 0,
  },
  sendBtnPressed: {
    transform: [{ scale: 0.93 }],
    backgroundColor: '#0d9488',
  },
  sendBtnDisabled: {
    backgroundColor: '#e2e8f0',
    shadowOpacity: 0,
    elevation: 0,
  },
});
