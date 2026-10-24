import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface GenerationEvents {
  onProgress?: (taskId: string, progress: number) => void;
  onCompleted?: (taskId: string, urls: string[]) => void;
  onFailed?: (taskId: string, error: string) => void;
}

export function useWebSocket(token: string | null, events: GenerationEvents = {}) {
  const socketRef = useRef<Socket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (!token) return;
    if (socketRef.current?.connected) return;

    const socket = io('http://localhost:3001/generation', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[WS] connected');
    });

    socket.on('disconnect', () => {
      console.log('[WS] disconnected');
    });

    socket.on('generation:progress', (data: { taskId: string; progress: number }) => {
      events.onProgress?.(data.taskId, data.progress);
    });

    socket.on('generation:completed', (data: { taskId: string; urls: string[] }) => {
      events.onCompleted?.(data.taskId, data.urls);
    });

    socket.on('generation:failed', (data: { taskId: string; error: string }) => {
      events.onFailed?.(data.taskId, data.error);
    });

    socketRef.current = socket;
  }, [token, events]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    subscribedRef.current.clear();
  }, []);

  const subscribeTask = useCallback((taskId: string) => {
    if (!socketRef.current || subscribedRef.current.has(taskId)) return;
    socketRef.current.emit('subscribe:task', taskId);
    subscribedRef.current.add(taskId);
  }, []);

  const unsubscribeTask = useCallback((taskId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('unsubscribe:task', taskId);
    subscribedRef.current.delete(taskId);
  }, []);

  useEffect(() => {
    if (token) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  return { subscribeTask, unsubscribeTask, connect, disconnect };
}
