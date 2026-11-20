# Adaptive Rescue Grid — 10-minute presentation and demo script

Replace Member 1 through Member 5 with the five team members’ names before presenting. Each speaker has approximately two minutes.

## 0:00–2:00 — Member 1: Introduction, problem, and objectives

“Good morning. We are presenting Adaptive Rescue Grid, an interactive reinforcement-learning simulator for rescue navigation. A robot must reach a rescue destination while avoiding blocked terrain and hazards. We chose this setting because disaster-response robots and drones need safe route-planning decisions, although our project is a simplified tabular simulator rather than a physical rescue system.

Our goals were to create a configurable grid, support manual gameplay, implement SARSA and Q-Learning from scratch, and make the learning process visible through Q-values, policies, reward curves, and fair comparison metrics. The application is designed as a live command center so that the algorithms can be demonstrated rather than only described in slides.

Member 2 will now define the Markov Decision Process used by the robot.”

## 2:00–4:00 — Member 2: MDP, TD learning, exploration, and terminal states

“In our MDP, a state is the robot’s grid cell. The action set is up, right, down, and left. The transition function moves the robot unless it hits a boundary or wall. Each move receives a configured reward: a small step cost, a wall cost, a positive rescue reward, and a large hazard penalty. The rescue goal and, in terminal scenarios, a hazard end the episode.

This is temporal-difference learning because the Q-table updates after every transition. Epsilon-greedy exploration selects a random action with probability epsilon and a best-valued action otherwise. Our seeded random generator controls exploration and tie-breaking, so a run can be reproduced.

At a terminal transition there is no next decision. Therefore the bootstrap value must be zero and the target equals only the observed terminal reward. Member 3 will compare the two update rules.”

## 4:00–6:00 — Member 3: SARSA, Q-Learning, and implementation architecture

“SARSA performs the update Q(s,a) equals Q(s,a) plus alpha times r plus gamma Q(s-prime,a-prime) minus Q(s,a). It is on-policy because it uses the next action actually selected by the epsilon-greedy behavior policy.

Q-Learning performs the update Q(s,a) equals Q(s,a) plus alpha times r plus gamma times the maximum next-state action value minus Q(s,a). It is off-policy because it learns toward a greedy target even when the behavior policy explores.

The distinction matters near hazards with continued exploration, but neither method is universally superior. The application separates the deterministic grid transition model, seeded random generator, Q-table helpers, training session, and React interface. This makes the algorithms testable and the visual dashboard accurate. Member 4 will show our fair experiment and live interface.”

## 6:00–8:00 — Member 4: Methodology and live demo

“For comparison, both algorithms start from a fresh zero Q-table and use the same map, reward settings, episode cap, exploration schedule, and matched seed set. We record reward, steps, success, hazard entries, learned policy, and greedy route.

For the live demo, we first choose the cliff-side evacuation scenario. The red cells represent a risk strip beside the shortest route. We then show the manual pad and move the robot once. Next we select an algorithm, keep the seed visible, start training, pause if required, and point out the changing Q-table and reward charts. After training, we replay the learned route and press Fair compare. The dashboard reports results from real runs with the displayed configuration.

Member 5 will interpret the actual experimental evidence and conclude.”

## 8:00–10:00 — Member 5: Results, conclusion, limitations, and Q&A

“The results slide reports a five-seed matched experiment in the cliff-side scenario. Read the values as results for this configuration, not as a general ranking. In our completed experiment, both algorithms achieved high end-window success rates, while their average steps, hazard entries, and route lengths differed. That difference is consistent with the fact that SARSA updates through behavior actions while Q-Learning targets the greedy action.

Our project demonstrates genuine tabular TD learning in a transparent, interactive environment. The main limitations are a small discrete state space, static fully observable maps, hand-designed rewards, and no physical-robot validation. Future work could add dynamic obstacles, safety constraints, partial observability, and function approximation such as DQN.

The live application is ready for interaction and questions.”

## Live-demo checklist

- Open the deployed or local cloud workspace app before the presentation.
- Choose **Cliff-side evacuation comparison**.
- Demonstrate one manual move using the visible pad.
- Show the seed and hyperparameters.
- Select SARSA, start at 20× or Max speed, and pause briefly if timing permits.
- Point to a changing Q-table row, reward chart, and terminal-bootstrap explanation.
- Use **Replay route** after completion.
- Use **Fair compare** and state that both sides use fresh zero Q-tables and the same conditions.
- Keep a completed seeded run available as a fallback, while still showing a short live start/pause sequence.

# Viva questions and concise answer points

1. **What is the MDP in this project?**  
   State: robot cell; actions: four moves; transitions: grid movement; rewards: rescue and safety feedback; terminal states: goal and, when configured, hazard.

2. **Why is this a TD method?**  
   It updates an estimate after each transition using a TD error instead of waiting for the entire episode.

3. **What does bootstrapping mean here?**  
   A current Q estimate uses another current Q estimate such as Q(s′,a′) or max Q(s′,a′).

4. **State the SARSA rule.**  
   Q(s,a) ← Q(s,a) + α[r + γQ(s′,a′) − Q(s,a)], with a zero bootstrap at a terminal transition.

5. **State the Q-Learning rule.**  
   Q(s,a) ← Q(s,a) + α[r + γ maxₐ′Q(s′,a′) − Q(s,a)], with a zero bootstrap at a terminal transition.

6. **Why is SARSA on-policy?**  
   Its update uses the next action actually selected by its epsilon-greedy behavior policy.

7. **Why is Q-Learning off-policy?**  
   It learns toward the greedy target policy although the behavior policy can still explore.

8. **What is epsilon-greedy exploration?**  
   Choose a random action with probability epsilon; otherwise choose a current best action.

9. **Why can behavior differ near hazards?**  
   With continued exploration, SARSA can value the risk of an exploratory move near a hazard; Q-Learning evaluates a greedy next action. The observed effect depends on map and settings.

10. **Why is terminal bootstrap zero?**  
    There is no next decision or future action value after a terminal goal or terminal hazard.

11. **What do alpha and gamma control?**  
    Alpha controls the weight given to new information; gamma discounts future reward.

12. **How did you ensure a fair comparison?**  
    Both algorithms use the same map, rewards, episode cap, matched seeds, hyperparameters, and fresh zero Q-tables.

13. **Why use a random seed?**  
    A seed makes exploration and greedy tie-breaking repeatable and auditable.

14. **What are the limits of a tabular Q-table?**  
    It grows poorly with large or continuous state spaces and assumes a manageable discrete representation.

15. **What is a reward-design risk?**  
    Poor reward shaping can create unintended behavior, such as safe loops or reward hacking, instead of efficient rescue completion.
