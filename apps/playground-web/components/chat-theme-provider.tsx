'use client';

import ThemeProvider from '@lobehub/ui/es/ThemeProvider/ThemeProvider.js';
import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, token }) => ({
  shell: css`
    height: 100dvh;
    overflow: hidden;
    background: ${token.colorBgLayout};
    color: ${token.colorText};
  `,
  scrollbars: css`
    scrollbar-color: ${token.colorFillSecondary} transparent;
    scrollbar-width: thin;

    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-thumb {
      border: 2px solid transparent;
      border-radius: 999px;
      background: ${token.colorFillSecondary};
      background-clip: content-box;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }
  `
}));

type ChatThemeProviderProps = {
  children: React.ReactNode;
};

export function ChatThemeProvider({ children }: ChatThemeProviderProps) {
  const { styles, cx } = useStyles();

  return (
    <ThemeProvider
      appearance="light"
      className={cx(styles.shell, styles.scrollbars)}
      defaultAppearance="light"
      enableCustomFonts={false}
      enableGlobalStyle={false}
      theme={{
        cssVar: true,
        token: {
          borderRadius: 12
        }
      }}
      themeMode="light"
    >
      {children}
    </ThemeProvider>
  );
}
