import { useAppTheme } from '../hooks/useAppTheme';
/**
 * ChatSheet — Chat efímero en BottomSheet al ~50%
 * - No bloquea el mapa
 * - Mensajes tipo burbuja
 * - Anti-spam 800ms
 * - Conectado al backend via Socket
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, TextInput, StyleSheet,
    FlatList, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { theme } from '../theme';
import socketService from '../services/socket';
import { useTranslation } from '../hooks/useTranslation';

interface Message {
    id: string;
    senderId: string;
    message: string;
    timestamp: number;
}

interface ChatSheetProps {
    rideId: string | null;
    myUserId: string | undefined;
    visible: boolean;
    onClose: () => void;
}

export default function ChatSheet({
 rideId, myUserId, visible, onClose }: ChatSheetProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { t } = useTranslation();

    const sheetRef   = useRef<BottomSheet>(null);
    const listRef    = useRef<FlatList>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput]       = useState('');
    const lastSentAt = useRef(0);

    // Abrir / cerrar sheet acorde a visible
    useEffect(() => {
        if (visible) {
            sheetRef.current?.snapToIndex(1); // 50%
        } else {
            sheetRef.current?.close();
        }
    }, [visible]);

    // Join room + escuchar mensajes
    useEffect(() => {
        if (!rideId || !myUserId) return;
        const socket = socketService.getSocket();
        if (!socket) return;

        socket.emit('join_chat', { rideId, userId: myUserId }, (res: any) => {
            if (res?.history_count > 0) {
                // El historial llega por 'chat_history', configurado abajo
            }
        });

        const onHistory = ({ messages: msgs }: { messages: Message[] }) => {
            setMessages(msgs);
        };

        const onMessage = (msg: Message) => {
            setMessages(prev => [...prev, msg]);
            listRef.current?.scrollToEnd({ animated: true });
        };

        socket.on('chat_history',   onHistory);
        socket.on('receive_message', onMessage);

        return () => {
            socket.off('chat_history',   onHistory);
            socket.off('receive_message', onMessage);
            socket.emit('leave_chat', { rideId });
            setMessages([]);
        };
    }, [rideId, myUserId]);

    const handleSend = useCallback(() => {
        const now = Date.now();
        if (!input.trim() || !rideId || !myUserId) return;
        if (now - lastSentAt.current < 800) return; // Anti-spam client-side
        lastSentAt.current = now;

        const socket = socketService.getSocket();
        socket?.emit('send_message', { rideId, senderId: myUserId, message: input.trim() });
        setInput('');
    }, [input, rideId, myUserId]);

    const renderMessage = ({ item }: { item: Message }) => {
        const isMe = item.senderId === myUserId;
        return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={[styles.bubbleText, isMe ? styles.textMe : styles.textThem]}>
                    {item.message}
                </Text>
                <Text style={styles.timestamp}>
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={['5%', '52%', '85%']}
            enablePanDownToClose
            onClose={onClose}
            backgroundStyle={styles.sheetBg}
            handleIndicatorStyle={styles.handle}
        >
            <BottomSheetView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>💬 Chat del Viaje</Text>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={styles.closeBtn}>✕</Text>
                    </TouchableOpacity>
                </View>

                {/* Mensajes */}
                <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyChat}>
                            <Text style={styles.emptyChatText}>{t('chat.empty')}</Text>
                        </View>
                    }
                />

                {/* Input */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={20}
                >
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={input}
                            onChangeText={setInput}
                            placeholder={t('chat.placeholder')}
                            placeholderTextColor={theme.colors.inputPlaceholder}
                            returnKeyType="send"
                            onSubmitEditing={handleSend}
                            maxLength={300}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!input.trim()}
                        >
                            <Text style={styles.sendBtnText}>↑</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </BottomSheetView>
        </BottomSheet>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    sheetBg: {
        backgroundColor: theme.colors.surface,
        borderRadius:    36,
        ...theme.shadows.lg,
    },
    handle: { backgroundColor: theme.colors.border, width: 40, height: 4 },
    container: { flex: 1, paddingHorizontal: theme.spacing.l },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: theme.spacing.m,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        marginBottom: theme.spacing.s,
    },
    headerTitle: { ...theme.typography.title, fontSize: 16 },
    closeBtn: { color: theme.colors.textSecondary, fontSize: 18, fontWeight: '600', padding: 4 },
    messageList: { paddingBottom: 10, paddingTop: theme.spacing.s },
    bubble: {
        maxWidth: '78%',
        padding:  10,
        borderRadius: 16,
        marginBottom: 8,
    },
    bubbleMe: {
        alignSelf:    'flex-end',
        backgroundColor: theme.colors.primary,
        borderBottomRightRadius: 4,
    },
    bubbleThem: {
        alignSelf:    'flex-start',
        backgroundColor: theme.colors.surfaceHigh,
        borderBottomLeftRadius: 4,
    },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    textMe:    { color: theme.colors.primaryText },
    textThem:  { color: theme.colors.text },
    timestamp: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 3, alignSelf: 'flex-end' },
    emptyChat: { paddingTop: 40, alignItems: 'center' },
    emptyChatText: { ...theme.typography.bodyMuted, textAlign: 'center' },
    inputRow: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           10,
        paddingVertical: theme.spacing.m,
        paddingBottom: Platform.OS === 'ios' ? 28 : theme.spacing.m,
    },
    input: {
        flex:             1,
        backgroundColor:  theme.colors.inputBackground,
        borderRadius:     theme.borderRadius.pill,
        paddingVertical:  12,
        paddingHorizontal: 18,
        fontSize:         15,
        color:            theme.colors.text,
        borderWidth:      1,
        borderColor:      theme.colors.border,
    },
    sendBtn: {
        width:            46,
        height:           46,
        borderRadius:     23,
        backgroundColor:  theme.colors.primary,
        alignItems:       'center',
        justifyContent:   'center',
        ...theme.shadows.primary,
    },
    sendBtnDisabled: { backgroundColor: theme.colors.surfaceHigh, ...theme.shadows.sm },
    sendBtnText: { color: theme.colors.primaryText, fontSize: 20, fontWeight: '700', lineHeight: 22 },
});
