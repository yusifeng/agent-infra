import { useMDXComponents as getDocsThemeMDXComponents } from 'nextra-theme-docs';
import type { MDXComponents } from 'nextra/mdx-components';

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...getDocsThemeMDXComponents(),
    ...components
  };
}
