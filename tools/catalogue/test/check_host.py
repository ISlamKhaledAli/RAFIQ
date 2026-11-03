"""Compile real host sources plus catalogue partials; run provider-free checks."""
import os
from pathlib import Path
import subprocess
import tempfile
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
DESKTOP = ROOT / "desktop"
NS = {"p": "http://schemas.microsoft.com/developer/msbuild/2003"}
tree = ET.parse(DESKTOP / "RafiqPOS.csproj")
sources = [str(DESKTOP / node.attrib["Include"].replace("\\", "/"))
           for node in tree.findall(".//p:Compile", NS)]
for path in ["Models/CatalogueReference.cs", "Services/CatalogueReferenceService.cs",
             "Repositories/ProductRepository.Catalogue.cs", "Bridge/IpcDispatcher.Catalogue.cs"]:
    full = str(DESKTOP / path)
    if full not in sources:
        sources.append(full)
references = []
for node in tree.findall(".//p:Reference", NS):
    hint = node.find("p:HintPath", NS)
    assembly = str(DESKTOP / hint.text.replace("\\", "/")) if hint is not None else node.attrib["Include"].split(",")[0]
    references.append("-r:" + assembly)

with tempfile.TemporaryDirectory(prefix="rafiq-catalogue-compile-") as directory:
    assembly = str(Path(directory) / "RafiqCatalogueHost.dll")
    for configuration in ["TRACE", "DEBUG,TRACE"]:
        subprocess.run(["mcs", "-langversion:5", "-target:library", "-define:" + configuration,
                        "-out:" + assembly] + references + sources, check=True)
    runner = str(Path(directory) / "HostPureTests.exe")
    if (ROOT / "frontend/public/catalogue/manifest.json").exists():
        shutil.copytree(ROOT / "frontend/public/catalogue", Path(directory) / "dist/catalogue")
    guard_runner = str(Path(directory) / "MerchantImportGuardTests.exe")
    subprocess.run(["mcs", "-langversion:5", "-out:" + guard_runner, "-r:" + assembly] +
                   references + [str(ROOT / "tools/catalogue/test/MerchantImportGuardTests.cs")], check=True)
    environment = dict(os.environ)
    environment["MONO_PATH"] = os.pathsep.join([directory, str(DESKTOP / "bin/Release")])
    subprocess.run(["mono", guard_runner], env=environment, check=True)
    subprocess.run(["mcs", "-langversion:5", "-out:" + runner, "-r:" + assembly] +
                   references + [str(ROOT / "tools/catalogue/test/HostPureTests.cs")], check=True)
    subprocess.run(["mono", runner], env=environment, check=True)
    nunit = DESKTOP / "packages/NUnit.3.13.3/lib/net45/nunit.framework.dll"
    subprocess.run(["mcs", "-langversion:5", "-target:library",
                    "-out:" + str(Path(directory) / "RafiqPOS.Tests.dll"), "-r:" + assembly,
                    "-r:" + str(nunit)] + references +
                   [str(DESKTOP / "RafiqPOS.Tests/TestBase.cs"),
                    str(DESKTOP / "RafiqPOS.Tests/Scenarios/CatalogueImportSafetyTests.cs")], check=True)
    print("Release/DEBUG C# 5 source compile and provider-free checks passed; NUnit scenario compiled, NOT executed.")
