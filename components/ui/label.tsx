'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

function Label({ className, htmlFor, children, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    >{children}</label>
  );
}

/** Associates a caption with its first direct form-control child, including UI wrappers. */
function ControlLabel({ children, htmlFor, ...props }: React.ComponentProps<'label'>) {
  const generatedId = React.useId();
  const nodes = React.Children.toArray(children);
  const controlIndex = nodes.findIndex((child) => React.isValidElement(child));
  const control = nodes[controlIndex];
  const controlId = htmlFor ?? (
    React.isValidElement<{ id?: string }>(control) ? control.props.id : undefined
  ) ?? generatedId;
  return <label {...props} htmlFor={controlId}>
    {nodes.map((child, index) => index === controlIndex && React.isValidElement<{ id?: string }>(child)
      ? React.cloneElement(child, { id: controlId })
      : child)}
  </label>;
}

export { Label, ControlLabel };
