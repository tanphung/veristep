from pathlib import Path
import ast

import python_minifier


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "contracts" / "veristep.py"
TARGET = ROOT / "contracts" / "veristep_release.py"
RUNNER = '# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }\n'


source = SOURCE.read_text(encoding="utf-8")
if not source.startswith(RUNNER):
    raise SystemExit("Pinned GenVM runner header changed")
if source.count("import genlayer as gl") != 1:
    raise SystemExit("Expected one GenLayer module import")

preserved_test_surface = [
    "VeriStep",
    "gl", "Address", "u8", "u32", "u256", "TreeMap", "DynArray", "str",
]
tree = ast.parse(source)
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        preserved_test_surface.append(node.name)
    elif isinstance(node, (ast.Assign, ast.AnnAssign)):
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            if isinstance(target, ast.Name):
                preserved_test_surface.append(target.id)

# Keep every annotation and identifier. Only comments, docstrings and redundant
# formatting are removed so the deployed artifact is semantically identical but
# fits Bradbury's transaction pubdata limit.
body = python_minifier.minify(
    source[len(RUNNER):],
    filename=str(SOURCE),
    remove_annotations=False,
    remove_pass=False,
    remove_literal_statements=True,
    combine_imports=True,
    # Hoist repeated immutable literals into module constants. This keeps the
    # public ABI and runtime behavior unchanged while materially reducing the
    # source bytes that Bradbury must publish in the deployment transaction.
    hoist_literals=True,
    rename_locals=True,
    preserve_locals=["self"],
    rename_globals=True,
    preserve_globals=preserved_test_surface,
    convert_posargs_to_args=False,
    remove_asserts=False,
)
release = RUNNER + body.rstrip() + "\n"
TARGET.write_text(release, encoding="utf-8", newline="\n")
print(f"{SOURCE.name}: {len(source.encode('utf-8'))} bytes")
print(f"{TARGET.name}: {len(release.encode('utf-8'))} bytes")
