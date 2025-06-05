import type { ComponentProps } from "react";
import { type LinkProps, useNavigate, useMatch } from "react-router";
import { omit, pick } from "remeda";
import { Focusable } from "../../models/interactive/interactive";

type InkLinkProps =
  & ComponentProps<typeof Focusable>
  & Pick<LinkProps, 'to' | 'relative' | 'state'>
  & { activeChildren?: React.ReactNode }

export const NavigationLink = (props: InkLinkProps) => {
  const linkPropKeys = ['to', 'relative', 'state'] as const;
  const { to, relative, state } = pick(props, linkPropKeys);
  const focusableProps = omit(props, linkPropKeys);

  const navigate = useNavigate();

  const toPath = typeof to === 'string' ? to : to.pathname;
  const match = useMatch(toPath ?? '/');

  const isActive = match != null;

  return (
    <Focusable
      flexGrow={0}
      flexShrink={1}
      flexDirection='row'
      {...focusableProps}
      onClick={(e) => {
        if (!e.defaultPrevented) {
          navigate(to, { relative, state })
        }

        props.onClick?.(e);
      }}
      onFocus={(e) => {
        if (!e.defaultPrevented) {
          navigate(to, { relative, state })
        }

        props.onFocus?.(e);
      }}
    >
      {isActive ? props.activeChildren ?? props.children : props.children}
    </Focusable>
  )
}