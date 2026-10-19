function splitPath(path) {
    const absolute = path.startsWith("/");
    const parts = [];
    for (const part of path.split("/")) {
        if (part === "" || part === ".") {
            continue;
        }
        if (part === "..") {
            const previous = parts[parts.length - 1];
            if (previous !== undefined && previous !== "..") {
                parts.pop();
            }
            else if (!absolute) {
                parts.push("..");
            }
            continue;
        }
        parts.push(part);
    }
    return { absolute, parts };
}
export function joinPosix(base, relative) {
    if (relative.startsWith("/")) {
        return relative;
    }
    if (base === "" || base === ".") {
        return relative;
    }
    return `${base.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}
/** Directory of a posix path. Absolute paths stay absolute. */
export function dirnamePosix(path) {
    const { absolute, parts } = splitPath(path);
    const parent = parts.slice(0, -1);
    if (absolute) {
        return `/${parent.join("/")}`;
    }
    return parent.join("/") || ".";
}
/** Relative posix path from `fromDir` to `toPath`. Both must be absolute or both relative. */
export function relativePosix(fromDir, toPath) {
    const from = splitPath(fromDir);
    const to = splitPath(toPath);
    let shared = 0;
    while (shared < from.parts.length &&
        shared < to.parts.length &&
        from.parts[shared] === to.parts[shared]) {
        shared += 1;
    }
    const ups = from.parts.length - shared;
    const rest = to.parts.slice(shared);
    const parts = [...Array(ups).fill(".."), ...rest];
    return parts.join("/") || ".";
}
//# sourceMappingURL=paths.js.map