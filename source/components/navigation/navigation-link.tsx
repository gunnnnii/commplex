import type { ComponentProps } from "react";
import { type LinkProps, useNavigate, useMatch } from "react-router";
import { omit, pick } from "remeda";
import { Focusable } from "../../models/interactive/interactive";
import { focus } from "../../models/interactive/node";

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
      id={toPath}
      flexGrow={0}
      flexShrink={1}
      flexDirection='row'
      {...focusableProps}
      onClick={(e) => {
        props.onClick?.(e);

        if (!e.defaultPrevented) {
          navigate(to, { relative, state })
        }
      }}
      onFocus={(e) => {
        props.onFocus?.(e);

        if (!e.defaultPrevented) {
          navigate(to, { relative, state })
        }
      }}
    >
      {isActive ? props.activeChildren ?? props.children : props.children}
    </Focusable>
  )
}