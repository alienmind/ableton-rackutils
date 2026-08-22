import { useState } from 'react';

interface RackTreeProps {
  root: Element;
}

// Generic XML tree viewer. No assumption about what any element means, that
// is the point: the schema is not verified yet (packages/adg-codec/SCHEMA.md).
export function RackTree({ root }: RackTreeProps) {
  return (
    <ul className="tree">
      <TreeNode el={root} depth={0} />
    </ul>
  );
}

// Attributes worth showing inline without expanding, because they carry the
// most reading value for a human scanning the tree.
const HEADLINE_ATTRS = ['Id', 'Name', 'Value', 'Slot'];

function TreeNode({ el, depth }: { el: Element; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const children = Array.from(el.children);
  const headline = HEADLINE_ATTRS.map((name) => el.getAttribute(name))
    .filter((v): v is string => v !== null)
    .join(' ');

  if (children.length === 0) {
    return (
      <li>
        <span className="tag leaf">{el.tagName}</span>
        {headline && <span className="headline"> {headline}</span>}
      </li>
    );
  }

  return (
    <li>
      <button className="tag" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} {el.tagName}
      </button>
      {headline && <span className="headline"> {headline}</span>}
      <span className="child-count"> ({children.length})</span>
      {open && (
        <ul>
          {children.map((child, i) => (
            <TreeNode key={i} el={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
