import { sandboxConformance } from "@alanos/domain-kit/testing";

/** The private folders are refused twice and the sandbox is the boundary (constitution VIS-S5). */
sandboxConformance(new URL("..", import.meta.url));
