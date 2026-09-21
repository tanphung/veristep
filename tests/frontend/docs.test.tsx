import {fireEvent,render,screen} from "@testing-library/react";
import {describe,expect,it} from "vitest";
import {Docs} from "../../frontend/src/Docs";
import {chain,contract,explorer} from "../../frontend/src/client";
import deployment from "../../frontend/src/deployment.json";

describe("current deployment documentation",()=>{
  it("links the configured deployment and distinguishes current rules from future recovery",()=>{
    const {container}=render(<Docs/>);
    expect(screen.getByText(String(chain.id))).toBeVisible();
    expect(screen.getByRole("link",{name:new RegExp(contract)})).toHaveAttribute("href",`${explorer}/contracts/${contract}`);
    expect(screen.getByRole("link",{name:/Inspect the deployment transaction/,hidden:true})).toHaveAttribute("href",`${explorer}/transactions/${deployment.deploymentTransaction}`);
    expect(screen.getByRole("heading",{name:"Path A — a report already exists"})).toBeVisible();
    expect(screen.getByRole("heading",{name:"Path B — review has not resolved"})).toBeVisible();
    expect(screen.getByText(/UNASSESSABLE ≠ VIOLATED/)).toBeVisible();
    expect(screen.getByText(/current release blocks timeout signing/)).not.toBeVisible();
    fireEvent.click(screen.getByText("Technical details & limitations"));
    expect(screen.getByText(/current release blocks timeout signing/)).toBeVisible();
    expect(screen.getByText(/Planned improvements/)).toBeVisible();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    for(const link of container.querySelectorAll<HTMLAnchorElement>('nav a')){
      const section=new URLSearchParams(link.hash.split("?")[1]).get("section");
      expect(container.querySelector(`#docs-${section}`)).not.toBeNull();
    }
  });
});
