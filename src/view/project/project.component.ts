import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {JsonPipe} from '@angular/common';
import {GitLabProject} from 'intern-gitlabinfo-openapi-angular';
import {ProjectService} from '../../service/project.service';
import {NgIf} from "@angular/common";

@Component({
  selector: 'app-details-page',
  standalone: true,
  imports: [
    NgIf,
    JsonPipe
  ],
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})
export class ProjectComponent implements OnInit {

  project: GitLabProject | null = null;

  constructor(private route: ActivatedRoute, private projectService: ProjectService) {
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (id) {
        this.loadProject(id);
      }
    });
  }

  loadProject(id: number): void {
    this.projectService.getProjectById(id).subscribe(
      (project: GitLabProject) => {
        this.project = project;
      },
      (error: any) => {
        console.error('Error fetching project:', error);
      });
  }

}
