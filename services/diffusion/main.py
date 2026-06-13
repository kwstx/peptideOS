import os
import json
import logging
import time
import random
from confluent_kafka import Consumer, Producer, KafkaError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("diffusion-service")

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

# Kafka configuration
producer_config = {'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS}
consumer_config = {
    'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
    'group.id': 'diffusion-group',
    'auto.offset.reset': 'earliest'
}

# Amino acids dictionary for sequence generation
AMINO_ACIDS = ["A", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y"]

def generate_peptide_sequence(prompt: str, target: str) -> str:
    """
    Simulates conditional sequence generation. In production, this runs
    an iterative denoising diffusion model conditioned on biomedical ontologies and Target bindings.
    """
    length = random.randint(12, 25)
    sequence = "".join(random.choice(AMINO_ACIDS) for _ in range(length))
    # Make sure we add a terminal group simulation
    return f"{sequence}-NH2"

def main():
    logger.info("Starting Diffusion Service...")
    
    # Initialize Consumer and Producer
    try:
        consumer = Consumer(consumer_config)
        producer = Producer(producer_config)
        consumer.subscribe(['peptide-design-jobs'])
        logger.info("Subscribed to 'peptide-design-jobs' topic.")
    except Exception as e:
        logger.error(f"Kafka Initialization error: {e}")
        logger.info("Falling back to mock loop since Kafka is missing.")
        # Simulating running in background if Kafka doesn't exist
        while True:
            time.sleep(10)
            logger.info("Mock Diffusion Service tick - awaiting jobs...")
        return

    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                else:
                    logger.error(f"Kafka error: {msg.error()}")
                    break

            # Process job
            try:
                job_data = json.loads(msg.value().decode('utf-8'))
                design_id = job_data.get("design_id")
                prompt = job_data.get("prompt")
                target = job_data.get("target_protein", "Unknown")
                
                logger.info(f"Processing design job {design_id}: '{prompt}' against target '{target}'")
                
                # Simulate 5-step diffusion denoising iteration
                for step in range(1, 6):
                    time.sleep(1)  # Simulating compute latency
                    logger.info(f"Design {design_id} - Diffusion Denoising Step {step}/5 - RMSD: {max(0.5, 3.5 - step*0.6):.2f}A")
                
                # Generate sequence
                sequence = generate_peptide_sequence(prompt, target)
                
                # Publish outcome to 'designed-peptides' topic
                output_payload = {
                    "design_id": design_id,
                    "prompt": prompt,
                    "disease_state": job_data.get("disease_state"),
                    "target_protein": target,
                    "sequence": sequence,
                    "simulation_complexity": job_data.get("simulation_complexity", "standard"),
                    "timestamp": time.time()
                }
                
                producer.produce(
                    'designed-peptides',
                    key=design_id,
                    value=json.dumps(output_payload)
                )
                producer.flush()
                logger.info(f"Successfully generated sequence '{sequence}' for {design_id}. Forwarded to 'designed-peptides'.")

            except Exception as e:
                logger.error(f"Error processing message: {e}")
                
    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()

if __name__ == "__main__":
    main()
