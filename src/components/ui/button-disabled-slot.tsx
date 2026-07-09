"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

type ButtonDisabledSlotProps = React.ComponentPropsWithoutRef<typeof Slot> & {
  ref?: React.Ref<HTMLElement>;
};

export function ButtonDisabledSlot({
  ref,
  onAuxClick: _onAuxClick,
  onClick: _onClick,
  onKeyDown: _onKeyDown,
  ...props
}: ButtonDisabledSlotProps) {
  const preventActivation = (event: React.SyntheticEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Slot
      {...props}
      ref={ref}
      onAuxClickCapture={preventActivation}
      onClickCapture={preventActivation}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          preventActivation(event);
        }
      }}
    />
  );
}
