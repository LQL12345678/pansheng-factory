import { useEffect } from 'react';

/**
 * 全局滚动条管理 Hook
 * 弹窗打开时锁定body滚动，防止页面跳动
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    // 获取滚动条宽度
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    if (scrollbarWidth > 0) {
      // 设置 body padding-right 补偿滚动条消失的宽度
      const originalPaddingRight = document.body.style.paddingRight;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.paddingRight = originalPaddingRight;
        document.body.style.overflow = '';
      };
    } else {
      // 没有滚动条，直接锁定
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isLocked]);
}

/**
 * 获取滚动条宽度
 */
export function getScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth;
}
