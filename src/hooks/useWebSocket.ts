import { useState, useEffect, useRef, useCallback } from "react";

type WebSocketStatus = "CONNECTING" | "OPEN" | "CLOSED" | "ERROR";

interface WebSocketConfig {
  url: string;
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  shouldConnect: boolean;
  reconnectInterval?: number;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  shouldConnect,
  reconnectInterval = 3000,
}: WebSocketConfig) {
  const [status, setStatus] = useState<WebSocketStatus>("CLOSED");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const connect = useCallback(() => {
    if (!shouldConnect) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close existing if necessary
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      setStatus("CONNECTING");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected to", url);
        setStatus("OPEN");
        onOpen?.();
      };

      ws.onmessage = (event) => {
        onMessage?.(event);
      };

      ws.onclose = () => {
        console.log("[WebSocket] Disconnected");
        setStatus("CLOSED");
        onClose?.();
        wsRef.current = null;

        if (shouldConnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error", error);
        setStatus("ERROR");
        ws.close();
      };
    } catch (e) {
      console.error("[WebSocket] Connection failed", e);
      setStatus("ERROR");
    }
  }, [url, shouldConnect, onMessage, onOpen, onClose, reconnectInterval]);

  useEffect(() => {
    if (shouldConnect) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [shouldConnect, connect]);

  const sendMessage = useCallback((data: string | object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      wsRef.current.send(payload);
    } else {
      console.warn("[WebSocket] Cannot send message, socket not open");
    }
  }, []);

  return { status, sendMessage };
}
