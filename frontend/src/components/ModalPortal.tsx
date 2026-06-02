import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
  visible: boolean;
}

/**
 * 弹窗 Portal 组件
 * 将弹窗内容挂载到 body 元素下，确保 position: fixed 相对于视口定位
 */
export default function ModalPortal({ children, visible }: ModalPortalProps) {
  if (!visible) return null;
  
  return createPortal(
    children,
    document.body
  );
}