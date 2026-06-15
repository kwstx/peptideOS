import os
import sys
import pytest
import asyncio
from typing import Dict, Any

# Ensure workspace paths are setup
WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

from tests.load_generator import LoadGenerator, generate_markdown_report

@pytest.mark.asyncio
async def test_concurrent_load_generation():
    """Validates that concurrent workload simulation executes, measures throughput, and records latency percentiles."""
    generator = LoadGenerator()
    concurrent_results = await generator.run_concurrent_load_test(num_researchers=2, num_enterprise=3)
    
    assert concurrent_results["total_requests"] == 8  # 2 researcher + 3 enterprise * 2 jobs
    assert concurrent_results["success_count"] == 8
    assert concurrent_results["failure_count"] == 0
    assert concurrent_results["throughput_requests_per_second"] >= 0.0
    
    latencies = concurrent_results["latency_seconds"]
    assert "avg" in latencies
    assert "p50" in latencies
    assert "p95" in latencies
    assert "p99" in latencies
    assert latencies["p95"] >= latencies["p50"]


def test_memory_profiling_subroutine():
    """Validates that tracemalloc correctly records memory footprint during Langevin dynamics calculations."""
    generator = LoadGenerator()
    # Profile short run of 100 steps
    prof = generator.profile_memory_md_subroutine("MGAFLGKVLKACVVALSGKLL-NH2", steps=100)
    
    assert prof["steps"] == 100
    assert prof["execution_time_seconds"] > 0
    assert prof["peak_memory_kb"] >= 0.0
    assert "mean_energy" in prof["results"]
    assert "min_distance" in prof["results"]
    assert "binding_stability" in prof["results"]


def test_progressive_autoscaling_hpa():
    """Validates that progressive autoscaling reacts correctly to high request rate spikes."""
    generator = LoadGenerator()
    # Baseline: 2 replicas, max 8. Inject load pattern that causes CPU utilization and queue depth spike
    load_increments = [10, 20, 100, 160, 40, 10]
    scaling_history = generator.simulate_progressive_autoscaling(
        base_replicas=2,
        max_replicas=8,
        load_increments=load_increments
    )
    
    assert len(scaling_history) == len(load_increments)
    
    # Verify scaling triggers and replica limit is respected
    max_scaled_replicas = max(step["current_replicas"] for step in scaling_history)
    assert max_scaled_replicas > 2
    assert max_scaled_replicas <= 8
    
    # Check that high load step has open queue depth and high CPU load
    high_load_step = scaling_history[3] # 160 RPS
    assert high_load_step["cpu_load_percentage"] >= 80.0
    assert high_load_step["kafka_queue_depth"] >= 0


def test_graceful_degradation_and_quota():
    """Validates that service levels downgrade and throttle when compute limits are approached."""
    generator = LoadGenerator()
    
    # 20 requests total, each cost factor is at least 2.5 compute units
    requests = [{"complexity": "standard", "sequence": "MGAFLGKVLKACVVALSGKLL-NH2"}] * 15
    # Initial quota is set to 20 units. This is not enough to complete all 15 requests at full fidelity.
    degradation_results = generator.evaluate_graceful_degradation(
        requests_payloads=requests,
        compute_quota_units=20.0
    )
    
    assert degradation_results["total_requests"] == 15
    assert degradation_results["initial_quota_units"] == 20.0
    assert degradation_results["quota_consumed_units"] <= 20.0
    
    # Verify that degradation strategies are active
    assert degradation_results["downgraded_count"] > 0 or degradation_results["throttled_count"] > 0
    
    # Check throttled requests contain throttled status and 0 actual steps
    throttled_details = [r for r in degradation_results["request_details"] if r["status"] == "THROTTLED_429"]
    for t in throttled_details:
        assert t["actual_steps"] == 0
        assert t["compute_cost_units"] == 0

    # Verify we can generate a markdown report from the outcomes
    mem_prof = generator.profile_memory_md_subroutine("MGAFLGKVLKACVVALSGKLL-NH2", steps=100)
    concurrent_results = {
        "total_requests": 8, "success_count": 8, "failure_count": 0, "duration_seconds": 1.5,
        "throughput_requests_per_second": 5.33,
        "latency_seconds": {"avg": 0.15, "p50": 0.12, "p95": 0.28, "p99": 0.35}
    }
    scaling_history = generator.simulate_progressive_autoscaling(2, 8, [10, 50, 10])
    
    report_md = generate_markdown_report(
        concurrent_results=concurrent_results,
        memory_profile=mem_prof,
        scaling_history=scaling_history,
        degradation_results=degradation_results
    )
    
    assert "# Performance and Scalability Assessment Report" in report_md
    assert "Kubernetes HPA Auto-Scaling Responsiveness" in report_md
    assert "Compute Quotas & Graceful Degradation" in report_md
