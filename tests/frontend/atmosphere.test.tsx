import {render,screen} from "@testing-library/react";
import {describe,expect,it} from "vitest";
import {Atmosphere} from "../../frontend/src/Atmosphere";

describe("decorative atmosphere",()=>{
  it("keeps artwork decorative without background controls",()=>{
    const {container}=render(<Atmosphere/>);
    expect(container.querySelector('.atmosphere-art')).toHaveAttribute('aria-hidden','true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('.vs-atmosphere')).not.toHaveClass('is-paused');
  });
});
