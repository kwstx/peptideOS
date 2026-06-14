import os
import time
import pytest
from playwright.sync_api import sync_playwright

# Frontend URL
FRONTEND_URL = "http://localhost:5173"
SCREENSHOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "artifacts"))

# Ensure screenshot directory exists
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def test_no_code_builder_ui():
    """
    E2E UI validation test that:
    1. Loads the React no-code builder interface.
    2. Submits a disease state prompt with design parameters.
    3. Triggers design and asserts pipeline tracking completion.
    4. Navigates all workspaces tabs and asserts element visibility.
    5. Saves screenshots of all tabs for report inclusion.
    """
    with sync_playwright() as p:
        # Launch browser in headless mode using system Chrome
        browser = p.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # 1. Open the no-code builder webpage
        print(f"Navigating to {FRONTEND_URL}...")
        page.goto(FRONTEND_URL)
        page.wait_for_selector("text=PeptiPrompt API", timeout=10000)

        # Assert tab 'Developer Workspace' is active
        assert page.locator("button.tab-btn.active").inner_text() == "Developer Workspace"
        print("Developer Workspace loaded successfully.")

        # 2. Fill in the Disease State Prompt
        prompt_textarea = page.locator("textarea.prompt-textarea")
        prompt_textarea.fill("Correcting mitochondrial tagging deficits in neurons after viral exposure")
        print("Filled in the prompt.")

        # 3. Select Target Protein and Complexity
        # Target Protein select is the first select on page
        target_select = page.locator("select").nth(0)
        target_select.select_option("PINK1 / Parkin")

        # Simulation scale select is the second select
        scale_select = page.locator("select").nth(1)
        scale_select.select_option("standard")
        print("Selected target and complexity parameters.")

        # 4. Set sliders (Sequence Length & Off-Target Tolerance)
        # First slider is sequence length (10 to 50)
        len_slider = page.locator("input[type='range']").nth(0)
        len_slider.evaluate("el => { el.value = 25; el.dispatchEvent(new Event('input', { bubbles: true })); }")

        # Second slider is off-target tolerance (0.01 to 0.2)
        tolerance_slider = page.locator("input[type='range']").nth(1)
        tolerance_slider.evaluate("el => { el.value = 0.05; el.dispatchEvent(new Event('input', { bubbles: true })); }")
        print("Configured sequence length and off-target tolerance sliders.")

        # 5. Check E2EE & Consent checkboxes
        page.check("input#e2ee-checkbox")
        page.check("input#consent-checkbox")
        print("Consent and E2EE checkboxes checked.")

        # Save pre-submit workspace screenshot
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_workspace_pre_submit.png"))

        # 6. Click 'Compile & Design Peptide' button
        page.click("button.design-btn")
        print("Submitted design compilation.")

        # 7. Monitor pipeline stages and wait for completion
        # The design button gets disabled during run or we can wait for the API export button
        # Timeout at 15 seconds to allow full simulation to complete
        page.wait_for_selector("button.infra-btn:has-text('Export Pipeline as API Script')", timeout=15000)
        print("Design compilation and digital twin simulation completed successfully.")

        # 8. Verify target sequence and physical telemetry values
        telemetry_container = page.locator("div.telemetry-card")
        assert telemetry_container.is_visible()
        
        target_seq_elem = page.locator("div:text-is('Target Sequence:') + div").first
        assert target_seq_elem.is_visible()
        sequence_text = target_seq_elem.inner_text().strip()
        assert sequence_text.endswith("-NH2")
        print(f"Verified generated sequence: {sequence_text}")

        # Assert physical telemetry properties are present
        assert "Structure RMSD" in telemetry_container.inner_text()
        assert "Free Energy" in telemetry_container.inner_text()
        assert "Perturbation Index" in telemetry_container.inner_text()

        # Save completed workspace screenshot
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_workspace_completed.png"))

        # 9. Verify Pathway Relationships tab
        print("Navigating to Pathway Relationships tab...")
        page.click("button.tab-btn:has-text('Pathway Relationships')")
        page.wait_for_selector("text=Pathway relationships Explorer", timeout=5000)
        
        # Click the PINK1 node in the interactive SVG signaling graph
        page.locator("g.graph-node:has-text('PINK1')").click()
        # Assert detail card displays node attributes
        node_card = page.locator("div.node-card")
        assert node_card.is_visible()
        assert "PINK1" in node_card.inner_text()
        assert "Protein Kinase" in node_card.inner_text()
        
        # Capture screenshot of Pathway Relationships tab
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_pathways_tab.png"))

        # 10. Verify Vector Embeddings tab
        print("Navigating to Vector Embeddings tab...")
        page.click("button.tab-btn:has-text('Vector Embeddings')")
        page.wait_for_selector("text=Qdrant Vector embeddings", timeout=5000)
        
        # Type search query and execute search
        page.fill("input.search-input", "mitochondrial tagging")
        page.click("button.search-btn:has-text('Search Space')")
        
        # Wait for search results cards
        page.wait_for_selector("div.vector-result-card", timeout=5000)
        assert page.locator("div.vector-result-card").count() > 0
        print("Verified vector embeddings similarity results.")
        
        # Capture screenshot of Vector Embeddings tab
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_vectors_tab.png"))

        # 11. Verify Efficacy & Risk (Conformal ML) tab
        print("Navigating to Efficacy & Risk tab...")
        page.click("button.tab-btn:has-text('Efficacy & Risk')")
        page.wait_for_selector("text=Efficacy & Risk Quantification", timeout=5000)
        
        # Assert key conformal safety telemetry elements are visible
        assert page.locator("text=Therapeutic Index (TI)").first.is_visible()
        assert page.locator("text=Risk Assessment Class").first.is_visible()
        assert page.locator("text=Dose-Response Profile with 95% Conformal Shading").first.is_visible()
        print("Verified Efficacy & Risk conformal safety metrics.")
        
        # Capture screenshot of Efficacy & Risk tab
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_efficacy_tab.png"))

        # 12. Verify Data Governance & Compliance tab
        print("Navigating to Data Governance & Compliance tab...")
        page.click("button.tab-btn:has-text('Data Governance')")
        page.wait_for_selector("text=Data Governance & Traceability Audit System", timeout=5000)
        assert page.locator("text=End-to-End Encryption (E2EE)").first.is_visible()
        print("Verified Data Governance audit trail.")
        
        # Capture screenshot of Data Governance tab
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_governance_tab.png"))

        # 13. Verify Observability & Developer Portal tab
        print("Navigating to Observability & Developer Portal tab...")
        page.click("button.tab-btn:has-text('Observability')")
        page.wait_for_selector("text=Ecosystem Integration & Observability", timeout=5000)
        assert page.locator("text=HPA Scaled: 2 - 8 Replicas").first.is_visible()
        print("Verified Observability developer portal metrics.")
        
        # Capture screenshot of Observability tab
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "nocode_observability_tab.png"))

        # Cleanup
        context.close()
        browser.close()
        print("UI E2E test finished successfully.")

if __name__ == "__main__":
    pytest.main(["-v", __file__])
